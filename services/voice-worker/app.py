"""
EXCLOAD private Voice Worker (Fun-CosyVoice3).

Does NOT belong on Vercel or the Coupang Lightsail proxy.
Run only on a dedicated NVIDIA GPU host.

Generate contract (JSON, no WAV through EXCLOAD):
  EXCLOAD issues short-lived Supabase signed URLs
  → Worker downloads reference, synthesizes, PUTs WAV to signed upload URL
  → returns { ok, output_storage_path } JSON only
"""

from __future__ import annotations

import logging
import os
import secrets
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl

from cosyvoice_engine import generate_wav_bytes, get_model_error, is_model_loaded, load_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("voice-worker")

app = FastAPI(title="EXCLOAD Voice Worker", version="0.2.0")

MAX_TEXT_CHARS = 1000
MAX_PROMPT_CHARS = 2000
MAX_INSTRUCTION_CHARS = 500
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SPEED_MIN = 0.5
SPEED_MAX = 1.5
HTTP_TIMEOUT = httpx.Timeout(120.0, connect=30.0)


class GenerateRequest(BaseModel):
    reference_download_url: HttpUrl
    reference_filename: str = Field(default="reference.wav", max_length=200)
    output_upload_url: HttpUrl
    output_object_key: str = Field(min_length=8, max_length=400)
    prompt_text: str
    text: str
    instruction: Optional[str] = None
    speed: float = 1.0


def _expected_secret() -> str:
    secret = os.environ.get("VOICE_SERVICE_SECRET", "").strip()
    if not secret:
        raise RuntimeError("VOICE_SERVICE_SECRET is required")
    return secret


def require_bearer(authorization: Optional[str] = Header(default=None)) -> None:
    expected = _expected_secret()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[len("Bearer ") :].strip()
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _assert_https_url(url: str, label: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"}:
        raise HTTPException(status_code=400, detail=f"{label}이 올바르지 않습니다.")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise HTTPException(status_code=400, detail=f"{label}은 HTTPS여야 합니다.")


def _ffmpeg_to_wav(src: Path, dst: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(dst),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        logger.error("ffmpeg failed: %s", (completed.stderr or "")[:400])
        raise HTTPException(status_code=400, detail="참조 음성을 WAV로 변환하지 못했습니다.")


@app.on_event("startup")
def startup() -> None:
    preload = os.environ.get("VOICE_PRELOAD_MODEL", "1").strip() != "0"
    if not preload:
        logger.info("Skipping model preload (VOICE_PRELOAD_MODEL=0)")
        return
    try:
        load_model()
    except Exception:  # noqa: BLE001
        logger.warning("Model not loaded at startup; /generate will fail until fixed")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "modelLoaded": is_model_loaded(),
        "modelError": get_model_error(),
    }


@app.post("/generate", dependencies=[Depends(require_bearer)])
async def generate(payload: GenerateRequest) -> JSONResponse:
    prompt = (payload.prompt_text or "").strip()
    tts_text = (payload.text or "").strip()
    instruct = (payload.instruction or "").strip() or None
    output_key = payload.output_object_key.strip()

    if not prompt:
        raise HTTPException(status_code=400, detail="참조 음성의 실제 대사를 입력해주세요.")
    if len(prompt) > MAX_PROMPT_CHARS:
        raise HTTPException(status_code=400, detail="참조 음성 대사가 너무 깁니다.")
    if not tts_text:
        raise HTTPException(status_code=400, detail="독백 텍스트를 입력해주세요.")
    if len(tts_text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=400, detail="독백 텍스트가 너무 깁니다.")
    if instruct and len(instruct) > MAX_INSTRUCTION_CHARS:
        raise HTTPException(status_code=400, detail="연기 지시가 너무 깁니다.")
    if payload.speed < SPEED_MIN or payload.speed > SPEED_MAX:
        raise HTTPException(status_code=400, detail="속도 값이 올바르지 않습니다.")
    if not output_key.startswith("voice/outputs/") or ".." in output_key:
        raise HTTPException(status_code=400, detail="출력 경로가 올바르지 않습니다.")

    ref_url = str(payload.reference_download_url)
    out_url = str(payload.output_upload_url)
    _assert_https_url(ref_url, "참조 음성 URL")
    _assert_https_url(out_url, "업로드 URL")

    suffix = Path(payload.reference_filename or "reference.wav").suffix.lower() or ".wav"
    if suffix not in {".wav", ".mp3", ".m4a", ".aac"}:
        suffix = ".bin"

    with tempfile.TemporaryDirectory(prefix="excload-voice-") as tmp:
        tmp_dir = Path(tmp)
        src_path = tmp_dir / f"reference{suffix}"
        wav_path = tmp_dir / "reference.wav"

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
                ref_resp = await client.get(ref_url)
                if ref_resp.status_code != 200:
                    raise HTTPException(status_code=400, detail="참조 음성을 내려받지 못했습니다.")
                raw = ref_resp.content
                if not raw:
                    raise HTTPException(status_code=400, detail="참조 음성 파일이 필요합니다.")
                if len(raw) > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=400, detail="참조 음성 파일이 너무 큽니다.")

                src_path.write_bytes(raw)
                if suffix == ".wav":
                    wav_path.write_bytes(raw)
                else:
                    _ffmpeg_to_wav(src_path, wav_path)

                try:
                    wav_bytes = generate_wav_bytes(
                        reference_path=wav_path,
                        prompt_text=prompt,
                        text=tts_text,
                        instruction=instruct,
                        speed=payload.speed,
                    )
                except HTTPException:
                    raise
                except Exception as exc:  # noqa: BLE001
                    logger.exception("generation failed")
                    raise HTTPException(
                        status_code=500,
                        detail="음성 생성 중 오류가 발생했습니다.",
                    ) from exc

                put_resp = await client.put(
                    out_url,
                    content=wav_bytes,
                    headers={
                        "Content-Type": "audio/wav",
                        "x-upsert": "false",
                    },
                )
                if put_resp.status_code not in {200, 201}:
                    logger.error("signed upload failed status=%s", put_resp.status_code)
                    raise HTTPException(status_code=500, detail="생성 음성 저장에 실패했습니다.")
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("worker io failed")
            raise HTTPException(
                status_code=500,
                detail="음성 생성 중 오류가 발생했습니다.",
            ) from exc

    return JSONResponse(
        status_code=200,
        content={"ok": True, "output_storage_path": output_key},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "요청을 처리할 수 없습니다."
    return JSONResponse(status_code=exc.status_code, content={"error": detail})

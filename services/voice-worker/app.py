"""
EXCLOAD private Voice Worker (Fun-CosyVoice3).

Does NOT belong on Vercel or the Coupang Lightsail proxy.
Run only on a dedicated NVIDIA GPU host.
"""

from __future__ import annotations

import logging
import os
import secrets
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from cosyvoice_engine import generate_wav_bytes, get_model_error, is_model_loaded, load_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("voice-worker")

app = FastAPI(title="EXCLOAD Voice Worker", version="0.1.0")

MAX_TEXT_CHARS = 1000
MAX_PROMPT_CHARS = 2000
MAX_INSTRUCTION_CHARS = 500
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SPEED_MIN = 0.5
SPEED_MAX = 1.5


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
def health() -> dict:
    return {
        "ok": True,
        "modelLoaded": is_model_loaded(),
        "modelError": get_model_error(),
    }


@app.post("/generate", dependencies=[Depends(require_bearer)])
async def generate(
    reference_audio: UploadFile = File(...),
    prompt_text: str = Form(...),
    text: str = Form(...),
    instruction: Optional[str] = Form(default=None),
    speed: float = Form(default=1.0),
) -> Response:
    prompt = (prompt_text or "").strip()
    tts_text = (text or "").strip()
    instruct = (instruction or "").strip() or None

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
    if speed < SPEED_MIN or speed > SPEED_MAX:
        raise HTTPException(status_code=400, detail="속도 값이 올바르지 않습니다.")

    raw = await reference_audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="참조 음성 파일이 필요합니다.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="참조 음성 파일이 너무 큽니다.")

    suffix = Path(reference_audio.filename or "reference.wav").suffix.lower() or ".wav"
    if suffix not in {".wav", ".mp3", ".m4a", ".aac"}:
        suffix = ".bin"

    with tempfile.TemporaryDirectory(prefix="excload-voice-") as tmp:
        tmp_dir = Path(tmp)
        src_path = tmp_dir / f"reference{suffix}"
        wav_path = tmp_dir / "reference.wav"
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
                speed=speed,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("generation failed")
            # Never return traceback / secrets to client
            raise HTTPException(
                status_code=500,
                detail="음성 생성 중 오류가 발생했습니다.",
            ) from exc

    return Response(content=wav_bytes, media_type="audio/wav")


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "요청을 처리할 수 없습니다."
    return JSONResponse(status_code=exc.status_code, content={"error": detail})

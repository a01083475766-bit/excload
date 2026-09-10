"""
Fun-CosyVoice3 inference adapter.

Requires official CosyVoice repo on disk (not vendored in EXCLOAD).
Pinned upstream: see README.md / THIRD_PARTY_NOTICES.md
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger("voice-worker.engine")

_model = None
_model_error: Optional[str] = None


def _repo_paths() -> tuple[Path, Path]:
    repo = Path(os.environ.get("COSYVOICE_REPO_PATH", "")).expanduser().resolve()
    model = Path(os.environ.get("COSYVOICE_MODEL_PATH", "")).expanduser().resolve()
    if not repo.is_dir():
        raise RuntimeError("COSYVOICE_REPO_PATH가 올바르지 않습니다.")
    if not model.is_dir():
        raise RuntimeError("COSYVOICE_MODEL_PATH가 올바르지 않습니다.")
    return repo, model


def ensure_import_path() -> None:
    repo, _ = _repo_paths()
    repo_str = str(repo)
    matcha = str(repo / "third_party" / "Matcha-TTS")
    if repo_str not in sys.path:
        sys.path.insert(0, repo_str)
    if matcha not in sys.path:
        sys.path.insert(0, matcha)


def is_model_loaded() -> bool:
    return _model is not None


def get_model_error() -> Optional[str]:
    return _model_error


def load_model() -> None:
    global _model, _model_error
    if _model is not None:
        return
    try:
        ensure_import_path()
        _, model_dir = _repo_paths()
        from cosyvoice.cli.cosyvoice import AutoModel  # type: ignore

        logger.info("Loading CosyVoice3 model from %s", model_dir)
        _model = AutoModel(model_dir=str(model_dir))
        _model_error = None
        logger.info("CosyVoice3 model loaded")
    except Exception as exc:  # noqa: BLE001 — surface as worker unavailable
        _model = None
        _model_error = str(exc)
        logger.exception("Failed to load CosyVoice3")
        raise


def _normalize_instruct(instruction: str) -> str:
    text = instruction.strip()
    if "<|endofprompt|>" in text:
        if not text.startswith("You are a helpful assistant"):
            return f"You are a helpful assistant. {text}"
        return text
    return f"You are a helpful assistant. {text}<|endofprompt|>"


def _normalize_prompt_text(prompt_text: str) -> str:
    text = prompt_text.strip()
    if text.startswith("You are a helpful assistant") and "<|endofprompt|>" in text:
        return text
    return f"You are a helpful assistant.<|endofprompt|>{text}"


def generate_wav_bytes(
    *,
    reference_path: Path,
    prompt_text: str,
    text: str,
    instruction: Optional[str],
    speed: float,
) -> bytes:
    load_model()
    assert _model is not None

    import torchaudio  # type: ignore

    chunks = []
    instruct = (instruction or "").strip()
    if instruct:
        # Official CosyVoice3 example: inference_instruct2(tts_text, instruct_text, prompt_wav, ...)
        for _, out in enumerate(
            _model.inference_instruct2(
                text,
                _normalize_instruct(instruct),
                str(reference_path),
                stream=False,
                speed=speed,
            )
        ):
            chunks.append(out["tts_speech"])
    else:
        # Official CosyVoice3 example: inference_zero_shot(tts_text, prompt_text, prompt_wav, ...)
        for _, out in enumerate(
            _model.inference_zero_shot(
                text,
                _normalize_prompt_text(prompt_text),
                str(reference_path),
                stream=False,
                speed=speed,
            )
        ):
            chunks.append(out["tts_speech"])

    if not chunks:
        raise RuntimeError("모델이 오디오를 생성하지 않았습니다.")

    import torch  # type: ignore

    speech = torch.concat(chunks, dim=1)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = Path(tmp.name)
    try:
        torchaudio.save(str(out_path), speech.cpu(), _model.sample_rate)
        return out_path.read_bytes()
    finally:
        try:
            out_path.unlink(missing_ok=True)
        except OSError:
            pass

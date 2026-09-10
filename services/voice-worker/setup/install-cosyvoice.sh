#!/usr/bin/env bash
# Install official FunAudioLLM/CosyVoice + Fun-CosyVoice3-0.5B-2512 on a GPU host.
# Do NOT run on the EXCLOAD Vercel app or the Coupang Lightsail proxy.
set -euo pipefail

PINNED_COMMIT="${COSYVOICE_PINNED_COMMIT:-074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc}"
INSTALL_ROOT="${COSYVOICE_INSTALL_ROOT:-/opt/CosyVoice}"
MODEL_DIR="${INSTALL_ROOT}/pretrained_models/Fun-CosyVoice3-0.5B"

echo "==> Cloning CosyVoice @ ${PINNED_COMMIT}"
if [[ ! -d "${INSTALL_ROOT}/.git" ]]; then
  git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git "${INSTALL_ROOT}"
fi
cd "${INSTALL_ROOT}"
git fetch --all --tags
git checkout "${PINNED_COMMIT}"
git submodule update --init --recursive

echo "==> Creating conda env cosyvoice (python 3.10)"
if ! command -v conda >/dev/null 2>&1; then
  echo "conda is required. Install Miniconda first." >&2
  exit 1
fi
conda create -n cosyvoice -y python=3.10 || true
# shellcheck disable=SC1091
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate cosyvoice
pip install -r requirements.txt

echo "==> Downloading Fun-CosyVoice3-0.5B-2512 (~9-10GB)"
export MODEL_DIR="${MODEL_DIR}"
python - <<'PY'
from huggingface_hub import snapshot_download
import os
model_dir = os.environ["MODEL_DIR"]
snapshot_download(
    "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
    local_dir=model_dir,
)
print("model ready:", model_dir)
PY

echo "==> Installing voice-worker FastAPI deps"
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
pip install -r "${WORKER_DIR}/requirements.txt"

echo "==> Ensure ffmpeg is available (apt install ffmpeg)"
command -v ffmpeg >/dev/null || echo "WARNING: ffmpeg not found"

echo "Done."
echo "Export:"
echo "  COSYVOICE_REPO_PATH=${INSTALL_ROOT}"
echo "  COSYVOICE_MODEL_PATH=${MODEL_DIR}"

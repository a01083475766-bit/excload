# EXCLOAD Voice Worker (Fun-CosyVoice3)

관리자 전용 독백 음성 추론 서버입니다.

- **실행 위치:** NVIDIA GPU Linux 호스트만
- **실행 금지:** Vercel(EXCLOAD Next.js), Lightsail 쿠팡 프록시, GPU 없는 개발 PC
- **모델:** `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` (~9–10GB, git에 포함하지 않음)

## Architecture

```
Browser → EXCLOAD /api/akman/voice/* (requireAkmanAdmin, JSON only)
       → short-lived signed URLs (private Supabase)
       → Voice Worker /generate (Bearer VOICE_SERVICE_SECRET, JSON)
       → Worker downloads reference + PUTs WAV to Storage
       → EXCLOAD marks COMPLETED from path JSON
Browser preview/download → EXCLOAD issues signed download URL → 302 to Storage
```

Audio binaries do **not** transit Vercel request/response bodies (avoids ~4.5MB platform limits).

## Upstream pin

| Item | Value |
|------|--------|
| Repository | https://github.com/FunAudioLLM/CosyVoice |
| Pinned commit | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` |
| Model | https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512 |
| License (code + weights) | Apache-2.0 (see `THIRD_PARTY_NOTICES.md`) |

핀은 설치 시점의 `main` HEAD입니다. 재설치 시 upstream 변경을 피하려면 동일 commit을 checkout 하세요.

## GPU host setup

1. Ubuntu + NVIDIA driver + CUDA + `ffmpeg`
2. Miniconda
3. Run:

```bash
chmod +x setup/install-cosyvoice.sh
export COSYVOICE_INSTALL_ROOT=/opt/CosyVoice
./setup/install-cosyvoice.sh
```

4. Copy `voice-worker.env.example` → `.env` and set `VOICE_SERVICE_SECRET` (same value as EXCLOAD env)
5. Start:

```bash
conda activate cosyvoice
export COSYVOICE_REPO_PATH=/opt/CosyVoice
export COSYVOICE_MODEL_PATH=/opt/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B
export VOICE_SERVICE_SECRET='(same as EXCLOAD)'
cd /path/to/excload/services/voice-worker
uvicorn app:app --host 0.0.0.0 --port 8090
```

6. Put HTTPS reverse proxy (Caddy/nginx) in front if EXCLOAD calls over the internet.
7. On EXCLOAD (Vercel):

```bash
VOICE_SERVICE_URL=https://your-gpu-host.example.com
VOICE_SERVICE_SECRET=(same secret)
VOICE_STORAGE_BUCKET=voice-private
# plus existing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
```

Create a **private** Supabase Storage bucket named like `voice-private` (no public policies).

## API

### `GET /health`

```json
{ "ok": true, "modelLoaded": true, "modelError": null }
```

### `POST /generate`

Headers: `Authorization: Bearer <VOICE_SERVICE_SECRET>`  
Body: JSON (no WAV through EXCLOAD / Vercel)

| field | required | notes |
|-------|----------|--------|
| `reference_download_url` | yes | short-lived Supabase signed download URL |
| `reference_filename` | no | for extension hint |
| `output_upload_url` | yes | short-lived Supabase signed upload URL |
| `output_object_key` | yes | must match `voice/outputs/...` |
| `prompt_text` | yes | transcript of reference |
| `text` | yes | new monologue |
| `instruction` | no | if set → `inference_instruct2` |
| `speed` | no | 0.5–1.5, default 1.0 |

Response JSON:

```json
{ "ok": true, "output_storage_path": "voice/outputs/.../....wav" }
```

or `{ "error": "..." }`.

Worker downloads the reference itself, synthesizes, and **PUTs WAV directly to Storage**.
EXCLOAD never receives the WAV body (avoids Vercel ~4.5MB limits).

## Generation modes

- No instruction → CosyVoice3 `inference_zero_shot(tts_text, prompt_text, prompt_wav, speed=...)`
- With instruction → CosyVoice3 `inference_instruct2(tts_text, instruct_text, prompt_wav, speed=...)`

Prompt text is prefixed with `You are a helpful assistant.<|endofprompt|>` when missing (official CosyVoice3 example style).

## Reference audio length

Official Gradio warns that prompts **longer than ~10 seconds** can hurt quality. EXCLOAD UI caps at **30 seconds** and recommends **3–10 seconds**. Longer references are **not** more precise for CosyVoice zero-shot.

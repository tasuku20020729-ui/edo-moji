# 江戸文字 生成システム 完全版

## 構成

- `frontend/`: Vercelへデプロイする Next.js UI
- `backend/`: GPUサーバーへデプロイする FastAPI 生成API
- `docker-compose.yml`: ローカル動作確認用

処理フロー:

```txt
入力文字
↓
無料日本語太字フォントで下書き画像生成
↓
ControlNet用Canny画像作成
↓
ControlNet + 本人筆致LoRA 生成 ※任意
↓
OpenCVで二値化・太字化・ノイズ補正
↓
PNG / PDF出力
```

## ローカル起動

```bash
cd edo-moji-complete
./scripts/run-local.sh
```

開く:

```txt
http://localhost:3000
```

バックエンド単体:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export GENERATE_API_TOKEN=local-secret
export PUBLIC_BASE_URL=http://localhost:8000
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

フロント単体:

```bash
cd frontend
npm install
cat > .env.local <<'ENV'
GENERATE_API_URL=http://localhost:8000
GENERATE_API_TOKEN=local-secret
ENV
npm run dev
```

## AI生成を有効化する場合

GPUサーバーで以下を追加インストールしてください。

```bash
pip install torch diffusers transformers accelerate safetensors
export ENABLE_DIFFUSERS=1
export CONTROLNET_MODEL=lllyasviel/sd-controlnet-canny
export BASE_MODEL=runwayml/stable-diffusion-v1-5
export USER_LORA_PATH=/models/user001-lora
```

LoRAが未準備でも `use_ai=false` ならOpenCV仕上げでPDFまで動作します。

## 環境変数

### frontend / Vercel

```env
GENERATE_API_URL=https://your-backend.example.com
GENERATE_API_TOKEN=強いランダム文字列
```

### backend / GPUサーバー

```env
PUBLIC_BASE_URL=https://your-backend.example.com
GENERATE_API_TOKEN=強いランダム文字列
EDO_FONT_PATH=/app/assets/fonts/your-edo-font.ttf
ENABLE_DIFFUSERS=0
```

## API

```bash
curl -X POST http://localhost:8000/generate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-secret' \
  -d '{"text":"商売繁盛","style":"edo-yose","size":1024,"seed":1234,"use_ai":false}'
```

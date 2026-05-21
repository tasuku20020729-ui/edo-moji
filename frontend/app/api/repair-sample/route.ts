import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

function dataUrlToFileInfo(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");

  if (!base64) {
    throw new Error("画像データが不正です");
  }

  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";

  const ext =
    mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
      ? "webp"
      : "png";

  return {
    buffer: Buffer.from(base64, "base64"),
    mime,
    filename: `input.${ext}`,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const char = String(body.char || "").trim();
    const rawImageUrl = String(body.rawImageUrl || "");
    const processedImageUrl = String(body.processedImageUrl || "");

    const sourceImage = rawImageUrl || processedImageUrl;

    if (!char || !sourceImage.startsWith("data:image")) {
      return NextResponse.json(
        { error: "文字または画像がありません" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const fileInfo = dataUrlToFileInfo(sourceImage);

    const inputImage = await toFile(
      fileInfo.buffer,
      fileInfo.filename,
      {
        type: fileInfo.mime,
      }
    );

    const result = await openai.images.edit({
      model: OPENAI_IMAGE_MODEL,
      image: inputImage,
      size: "1024x1024",
      prompt: `
この画像から、対象文字「${char}」の文字部分だけを抽出してください。

出力条件:
- 白背景
- 黒文字のみ
- 画像内の対象文字「${char}」の形をできるだけ維持
- 元画像の筆跡、線の太さ、払い、止め、重心、バランスを維持
- 背景、影、紙の罫線、ノイズ、写真の暗い部分を完全に除去
- 余白を適切に取り、文字を中央に配置
- 文字を別字にしない
- 画を増やさない
- 画を減らさない
- 装飾、印鑑、署名、紙質表現は禁止
- 真っ黒な四角や背景ノイズを絶対に出さない
- 出力は1文字だけ
`,
    });

    const b64 = result.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error("AI画像補正結果が空です");
    }

    return NextResponse.json({
      imageUrl: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "AI画像補正に失敗しました",
      },
      { status: 500 }
    );
  }
}
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

    const parentChar = String(body.parentChar || "").trim();
    const radical = String(body.radical || "").trim();
    const sourceImageUrl = String(body.sourceImageUrl || "");

    if (!parentChar || !radical || !sourceImageUrl.startsWith("data:image")) {
      return NextResponse.json(
        { error: "親文字・部首・画像が不足しています" },
        { status: 400 }
      );
    }

    const fileInfo = dataUrlToFileInfo(sourceImageUrl);

    const inputImage = await toFile(fileInfo.buffer, fileInfo.filename, {
      type: fileInfo.mime,
    });

    const result = await openai.images.edit({
      model: OPENAI_IMAGE_MODEL,
      image: inputImage,
      size: "1024x1024",
      prompt: `
この画像は、故人が書いた楷書体の「${parentChar}」です。

この画像から、構成要素「${radical}」だけを抽出し、
白背景・黒文字のみの部首パーツ画像を作成してください。

重要:
- 抽出するのは「${radical}」に該当する部分だけ
- 他の部品を混ぜない
- 元画像の筆跡、線の太さ、払い、止め、重心をできるだけ維持
- 文字全体「${parentChar}」を出力しない
- 背景、影、紙の罫線、ノイズを除去
- 白背景
- 黒文字のみ
- 余白を適切に取り、中央配置
- 装飾、印鑑、署名は禁止
- 真っ黒な四角や背景ノイズは禁止
`,
    });

    const b64 = result.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error("部首画像生成に失敗しました");
    }

    return NextResponse.json({
      imageUrl: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "部首画像生成に失敗しました",
      },
      { status: 500 }
    );
  }
}
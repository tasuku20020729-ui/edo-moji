import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const char = String(body.char || "").trim();
    const imageUrl = String(body.imageUrl || "");

    if (!char || !imageUrl.startsWith("data:image")) {
      return NextResponse.json(
        {
          error: "画像がありません",
        },
        {
          status: 400,
        }
      );
    }

    const result = await openai.images.generate({
      model: OPENAI_IMAGE_MODEL,

      size: "1024x1024",

      prompt: `
白背景に黒文字のみで、
日本の楷書体の実筆文字画像を生成してください。

対象文字:
${char}

重要:
- 元画像の文字形を維持
- 文字を変形しない
- ノイズ除去
- 背景は純白
- 文字は黒
- 墨のかすれは残してよい
- 真っ黒四角にしない
- 余計な装飾禁止
`,
    });

    const b64 = result.data?.[0]?.b64_json;

    if (!b64) {
      throw new Error("AI画像補正失敗");
    }

    return NextResponse.json({
      imageUrl: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI画像補正失敗",
      },
      {
        status: 500,
      }
    );
  }
}
import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL ||
  "tasuku20020729-ui/kaisho-artisan-lora";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");

  const mime =
    header.match(/data:(.*);base64/)?.[1] ||
    "image/png";

  const buffer = Buffer.from(base64, "base64");

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Blob([arrayBuffer], {
    type: mime,
  });
}

async function outputToBase64Image(output: unknown) {
  const first = Array.isArray(output)
    ? output[0]
    : output;

  if (!first) {
    throw new Error("AI出力が空です");
  }

  if (typeof first === "string") {
    const response = await fetch(first);

    const arrayBuffer =
      await response.arrayBuffer();

    const base64 = Buffer.from(
      arrayBuffer
    ).toString("base64");

    return `data:image/png;base64,${base64}`;
  }

  throw new Error(
    "AI出力形式エラー"
  );
}

function buildInput(
  text: string,
  guideImage: string
) {
  return {
    prompt: `
Japanese Kaisho tombstone calligraphy.

STRICTLY preserve the original character structure.

The guide image defines the exact kanji shape.

Transform ONLY the stroke style into authentic handcrafted brush calligraphy.

Requirements:
- Same exact kanji
- Same stroke count
- Same structure
- Thick powerful strokes
- Solid black ink
- Pure white background
- No gray
- No blur
- No broken strokes
- No missing stroke
- No dry brush
- No paper texture
- No ink splash
- No artistic abstraction
- Suitable for stone engraving
- Clean edge
- Strong brush pressure

Text: ${text}
`,

    negative_prompt: `
wrong kanji,
different character,
missing stroke,
extra stroke,
broken stroke,
dry brush,
paper texture,
gray color,
blur,
noise,
seal,
stamp,
signature,
calligraphy paper,
watercolor,
artistic style,
thin stroke,
typography,
computer font
`,

    image: dataUrlToBlob(guideImage),

    aspect_ratio: "1:1",

    output_format: "png",

    guidance_scale: 8,

    prompt_strength: 0.72,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(
      body.text || ""
    ).trim();

    const useAI =
      body.useAI ?? false;

    const guideImage =
      body.guideImage || "";

    if (!text) {
      return NextResponse.json(
        {
          error:
            "文字を入力してください",
        },
        { status: 400 }
      );
    }

    if (!guideImage) {
      return NextResponse.json(
        {
          error:
            "guide image missing",
        },
        { status: 400 }
      );
    }

    if (!useAI) {
      return NextResponse.json({
        imageUrl: guideImage,
      });
    }

    const output =
      await replicate.run(
        REPLICATE_MODEL as any,
        {
          input: buildInput(
            text,
            guideImage
          ),
        }
      );

    const imageUrl =
      await outputToBase64Image(
        output
      );

    return NextResponse.json({
      imageUrl,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "生成失敗",
      },
      { status: 500 }
    );
  }
}
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
    throw new Error("Replicateの出力が空です");
  }

  if (typeof first === "string") {
    if (first.startsWith("data:image")) {
      return first;
    }

    const response = await fetch(first);

    if (!response.ok) {
      throw new Error(
        "AI画像URLの取得に失敗しました"
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const base64 = Buffer.from(
      arrayBuffer
    ).toString("base64");

    return `data:image/png;base64,${base64}`;
  }

  if (
    typeof first === "object" &&
    first !== null &&
    "blob" in first &&
    typeof (
      first as {
        blob: () => Promise<Blob>;
      }
    ).blob === "function"
  ) {
    const blob = await (
      first as {
        blob: () => Promise<Blob>;
      }
    ).blob();

    const arrayBuffer =
      await blob.arrayBuffer();

    const base64 = Buffer.from(
      arrayBuffer
    ).toString("base64");

    return `data:image/png;base64,${base64}`;
  }

  if (
    typeof first === "object" &&
    first !== null &&
    "url" in first
  ) {
    const urlValue = (
      first as { url?: unknown }
    ).url;

    const url =
      typeof urlValue === "function"
        ? (
            urlValue as () => URL
          )().toString()
        : String(urlValue);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        "AI画像URLの取得に失敗しました"
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const base64 = Buffer.from(
      arrayBuffer
    ).toString("base64");

    return `data:image/png;base64,${base64}`;
  }

  throw new Error(
    "Replicateの出力形式を処理できません"
  );
}

function buildInput(
  text: string,
  guideImage: string
) {
  return {
    prompt: `
KAIARTISAN style.

Rewrite the provided guide image as natural handwritten Japanese Kaisho calligraphy by the trained artisan.

The input image is only a character guide.
Do not keep it as a clean computer font.
Actively reshape it into real hand-brushed calligraphy.

Important:
- The intended Japanese text is: ${text}
- Keep the same Japanese character identity.
- Do not replace it with another kanji.
- Convert the font-like guide into handwritten brush calligraphy.
- Make it look like the trained artisan wrote it by hand.
- Allow natural handwritten deformation.
- Make stroke edges irregular.
- Add strong brush pressure.
- Add ink pooling at stroke ends.
- Add dry brush texture.
- Add subtle uneven balance like real handwriting.
- Black ink only.
- White paper background.
- No stamps.
- No decorations.
`,

    negative_prompt: `
wrong kanji,
different character,
extra characters,
missing characters,
unreadable text,
stamp,
red seal,
signature,
decoration,
colored background,
gray background,
clean digital font,
computer font,
perfect vector text,
typography
`,

    image: dataUrlToBlob(guideImage),

    aspect_ratio: "1:1",

    output_format: "png",

    guidance_scale: 6.5,

    prompt_strength: 0.85,
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

    if (
      !guideImage ||
      !guideImage.startsWith(
        "data:image"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "下書き画像がありません",
        },
        { status: 400 }
      );
    }

    if (!useAI) {
      return NextResponse.json({
        imageUrl: guideImage,
      });
    }

    if (
      !process.env
        .REPLICATE_API_TOKEN
    ) {
      return NextResponse.json(
        {
          error:
            "REPLICATE_API_TOKEN が設定されていません",
        },
        { status: 500 }
      );
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
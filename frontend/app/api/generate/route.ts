import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "tasuku20020729-ui/kaisho-artisan-lora";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");

  if (!base64) {
    throw new Error("画像データが不正です");
  }

  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const buffer = Buffer.from(base64, "base64");

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Blob([arrayBuffer], { type: mime });
}

async function fetchImageAsDataUrl(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("AI画像URLの取得に失敗しました");
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:image/png;base64,${base64}`;
}

async function outputToBase64Image(output: unknown) {
  const first = Array.isArray(output) ? output[0] : output;

  if (!first) {
    throw new Error("Replicateの出力が空です");
  }

  if (typeof first === "string") {
    if (first.startsWith("data:image")) {
      return first;
    }

    return fetchImageAsDataUrl(first);
  }

  if (typeof first === "object" && first !== null && "url" in first) {
    const urlValue = (first as { url?: unknown }).url;

    const url =
      typeof urlValue === "function"
        ? (urlValue as () => URL)().toString()
        : String(urlValue);

    return fetchImageAsDataUrl(url);
  }

  if (
    typeof first === "object" &&
    first !== null &&
    "blob" in first &&
    typeof (first as { blob?: unknown }).blob === "function"
  ) {
    const blob = await (first as { blob: () => Promise<Blob> }).blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return `data:image/png;base64,${base64}`;
  }

  throw new Error("Replicateの出力形式を処理できません");
}

function buildInput(text: string, guideImage: string) {
  return {
    prompt: `
KAIARTISAN style.

Japanese handwritten Kaisho calligraphy by the trained artisan.

Use the guide image to keep the exact Japanese character.
However, the final strokes must strongly reflect the trained artisan's handwriting style.

Important:
- Intended Japanese text: ${text}
- Keep exactly the same Japanese character.
- Never change it into another kanji.
- Never add extra characters.
- Never remove characters.
- Never add unnecessary strokes.
- Never remove important strokes.
- Preserve readability as formal Kaisho.
- Strongly apply the trained artisan's handwriting.
- Make it look like the artisan actually wrote it with a brush.
- Human handwritten imbalance is allowed.
- Strong brush pressure.
- Thick solid black ink.
- Natural tome.
- Natural hane.
- Natural harai.
- Dignified formal Kaisho.
- Suitable for tombstone engraving.
- White background.
- Black ink only.
- No red seal.
- No signature.
- No decoration.
`,

    negative_prompt: `
wrong kanji,
different kanji,
different character,
extra character,
missing character,
extra stroke,
missing stroke,
missing important stroke,
unreadable text,
collapsed structure,
cursive script,
sosho,
gyosho,
abstract calligraphy,
font,
digital font,
computer font,
typography,
perfect vector font,
plain mincho font,
thin stroke,
gray ink,
dirty background,
paper texture,
colored background,
red seal,
stamp,
signature,
decoration,
low quality,
blur,
noise
`,

    image: dataUrlToBlob(guideImage),

    aspect_ratio: "1:1",
    output_format: "png",

    // 筆跡を強める
    guidance_scale: 4.5,

    // 下書きから離れすぎず、LoRAの筆跡を乗せる
    prompt_strength: 0.7,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(body.text || "").trim();
    const useAI = Boolean(body.useAI);
    const guideImage = String(body.guideImage || "");

    if (!text) {
      return NextResponse.json(
        { error: "文字を入力してください" },
        { status: 400 }
      );
    }

    if (!guideImage || !guideImage.startsWith("data:image")) {
      return NextResponse.json(
        { error: "下書き画像がありません" },
        { status: 400 }
      );
    }

    if (!useAI) {
      return NextResponse.json({
        imageUrl: guideImage,
      });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Vercelの環境変数 REPLICATE_API_TOKEN が設定されていません",
        },
        { status: 500 }
      );
    }

    const output = await replicate.run(REPLICATE_MODEL as any, {
      input: buildInput(text, guideImage),
    });

    const imageUrl = await outputToBase64Image(output);

    return NextResponse.json({
      imageUrl,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "生成に失敗しました",
      },
      { status: 500 }
    );
  }
}
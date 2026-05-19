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

The guide image is a very thin black character guide.
Use it only to preserve the exact character identity and basic structure.
The final output should strongly prioritize the trained artisan's handwriting style.

Important:
- Intended Japanese text: ${text}
- Preserve the exact Japanese character.
- Do not generate another kanji.
- Do not add extra characters.
- Do not remove characters.
- Preserve the readable Kaisho structure.
- The guide image is only a thin black line guide.
- Strongly apply the trained LoRA handwriting style.
- Add brush thickness using the trained artisan style.
- Add strong brush pressure.
- Add natural tome, hane, and harai.
- Do not output hollow strokes.
- Do not output outline text.
- Output solid black filled brush strokes.
- Make it look handwritten by the trained artisan.
- Human handwritten imbalance is allowed.
- Formal Kaisho.
- Suitable for tombstone engraving.
- Clean white background.
- Black ink only.
- No paper texture.
- No decoration.
- No seal.
- No signature.
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
hollow text,
outline text,
white fill,
white inside strokes,
outlined strokes,
border only,
thin stroke,
digital font,
computer font,
typography,
perfect vector font,
plain mincho font,
gray ink,
dirty background,
paper texture,
colored background,
red seal,
stamp,
signature,
decoration,
noise,
blur,
low quality
`,

    image: dataUrlToBlob(guideImage),

    aspect_ratio: "1:1",
    output_format: "png",

    // 筆跡優先
    guidance_scale: 2.0,

    // 下書きは骨格だけ、LoRAで大きく肉付け
    prompt_strength: 0.8,
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
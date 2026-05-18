import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-dev";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";

  const buffer = Buffer.from(base64, "base64");
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Blob([arrayBuffer], { type: mime });
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

    const imageResponse = await fetch(first);

    if (!imageResponse.ok) {
      throw new Error("AI画像URLの取得に失敗しました");
    }

    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

    return `data:image/png;base64,${imageBase64}`;
  }

  if (
    typeof first === "object" &&
    first !== null &&
    "blob" in first &&
    typeof (first as { blob: () => Promise<Blob> }).blob === "function"
  ) {
    const blob = await (first as { blob: () => Promise<Blob> }).blob();
    const imageArrayBuffer = await blob.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

    return `data:image/png;base64,${imageBase64}`;
  }

  if (
    typeof first === "object" &&
    first !== null &&
    "url" in first
  ) {
    const urlValue = (first as { url?: unknown }).url;

    const url =
      typeof urlValue === "function"
        ? (urlValue as () => URL)().toString()
        : String(urlValue);

    const imageResponse = await fetch(url);

    if (!imageResponse.ok) {
      throw new Error("AI画像URLの取得に失敗しました");
    }

    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

    return `data:image/png;base64,${imageBase64}`;
  }

  throw new Error("Replicateの出力形式を処理できません");
}

function buildInput(text: string, guideImage: string) {
  return {
    prompt: `
KAIARTISAN style.

Transform the provided guide image into traditional Japanese Kaisho calligraphy.

This is image-to-image calligraphy shaping, not text-to-image generation.

Critical rules:
- Do not create new characters.
- Do not replace, omit, rearrange, or invent characters.
- Preserve the exact Japanese characters from the guide image.
- Preserve the exact structure, stroke positions, layout, and vertical arrangement from the guide image.
- Use the guide image as a strict shape mask.
- Only change the visual calligraphy texture and brush feeling.
- Make the strokes look handwritten by the trained artisan.
- Add natural brush pressure, dry brush edges, ink pooling, and handmade irregularity.
- Keep black ink only.
- Keep a clean white background.
- No extra marks.
- No stamps.
- No decorations.
- No red seals.
- No background objects.

The intended text is: ${text}
`,

    negative_prompt: `
wrong kanji,
incorrect Japanese character,
extra characters,
missing characters,
invented characters,
replaced characters,
distorted text,
unreadable text,
symbols,
stamps,
red seal,
signature,
decorations,
background pattern,
colored ink,
gray background
`,

    input_image: dataUrlToBlob(guideImage),

    aspect_ratio: "1:1",
    output_format: "png",

    // Kontext系で効く場合のみ反映されます。
    // 文字形を守りたいので強すぎない設定にしています。
    guidance_scale: 2.5,
    prompt_strength: 0.25,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(body.text || "").trim();
    const useAI = body.useAI ?? false;
    const guideImage = body.guideImage || "";

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
        { error: "REPLICATE_API_TOKEN が設定されていません" },
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
        error: error instanceof Error ? error.message : "生成失敗",
      },
      { status: 500 }
    );
  }
}
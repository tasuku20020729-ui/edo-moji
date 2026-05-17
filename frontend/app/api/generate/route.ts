import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-dev";

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
    "url" in first &&
    typeof (first as { url: () => URL }).url === "function"
  ) {
    const url = (first as { url: () => URL }).url().toString();

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

    if (!guideImage || !guideImage.startsWith("data:image")) {
      return NextResponse.json(
        { error: "下書き画像がありません" },
        { status: 400 }
      );
    }

    const prompt = `
Transform the provided guide image into Japanese Kaisho calligraphy.

Very important:
- Preserve the exact Japanese characters: ${text}
- Do not change, replace, omit, or invent characters.
- Use the guide image as the strict layout and character shape reference.
- Traditional Japanese Kaisho style.
- Strong brush pressure.
- Elegant handwritten calligraphy.
- Natural ink texture.
- Clean white background.
- Black ink only.
- No extra marks.
- No stamps.
- No decorations.
`;

    const output = await replicate.run(REPLICATE_MODEL as `${string}/${string}`, {
      input: {
        prompt,
        input_image: guideImage,
        aspect_ratio: "1:1",
        output_format: "png",
      },
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
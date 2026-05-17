import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

function createSimpleSvg(text: string) {
  return `
  <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text
      x="50%"
      y="50%"
      font-size="120"
      text-anchor="middle"
      dominant-baseline="middle"
      fill="black"
      font-weight="bold"
    >
      ${text}
    </text>
  </svg>
  `;
}

async function outputToBase64Image(output: unknown) {
  const first = Array.isArray(output) ? output[0] : output;

  if (!first) {
    throw new Error("Replicateの出力が空です");
  }

  // パターン1: URL文字列
  if (typeof first === "string") {
    const imageResponse = await fetch(first);

    if (!imageResponse.ok) {
      throw new Error("AI画像URLの取得に失敗しました");
    }

    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

    return `data:image/png;base64,${imageBase64}`;
  }

  // パターン2: FileOutput形式
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

  // パターン3: url() メソッド形式
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

    const text = body.text || "";
    const useAI = body.useAI ?? false;

    if (!text) {
      return NextResponse.json(
        { error: "文字を入力してください" },
        { status: 400 }
      );
    }

    if (useAI) {
      const prompt = `
Japanese Edo moji calligraphy.
Bold black ink brush lettering.
Traditional Japanese signboard style.
White background.
Text: ${text}
`;

      const output = await replicate.run("black-forest-labs/flux-schnell", {
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: "1:1",
          output_format: "png",
        },
      });

      const imageUrl = await outputToBase64Image(output);

      return NextResponse.json({
        imageUrl,
      });
    }

    const svg = createSimpleSvg(text);

    const base64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString(
      "base64"
    )}`;

    return NextResponse.json({
      imageUrl: base64,
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
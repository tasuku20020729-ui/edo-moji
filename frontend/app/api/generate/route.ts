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

    // =====================================
    // AI生成ON
    // =====================================

    if (useAI) {
      const prompt = `
Japanese Edo moji calligraphy.
Bold black ink brush lettering.
Traditional Japanese signboard style.
White background.
Text: ${text}
`;

      const output = await replicate.run(
        "black-forest-labs/flux-schnell",
        {
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "png",
          },
        }
      );

      const first = Array.isArray(output)
        ? output[0]
        : output;

      const rawUrl =
        typeof first === "string"
          ? first
          : first &&
            typeof first === "object" &&
            "url" in first
            ? String(first.url)
            : String(first);

      // =====================================
      // Replicate画像取得
      // =====================================

      const imageResponse = await fetch(rawUrl);

      if (!imageResponse.ok) {
        return NextResponse.json(
          {
            error: "AI画像の取得に失敗しました",
          },
          { status: 500 }
        );
      }

      const imageArrayBuffer =
        await imageResponse.arrayBuffer();

      const imageBase64 =
        Buffer.from(imageArrayBuffer).toString(
          "base64"
        );

      return NextResponse.json({
        imageUrl:
          `data:image/png;base64,${imageBase64}`,
      });
    }

    // =====================================
    // AI生成OFF
    // =====================================

    const svg = createSimpleSvg(text);

    const base64 =
      `data:image/svg+xml;base64,${Buffer.from(svg).toString(
        "base64"
      )}`;

    return NextResponse.json({
      imageUrl: base64,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "生成失敗" },
      { status: 500 }
    );
  }
}
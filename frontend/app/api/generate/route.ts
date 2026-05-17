import Replicate from "replicate";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = body.text || "";

    if (!text) {
      return NextResponse.json(
        { error: "文字を入力してください。" },
        { status: 400 }
      );
    }

    const prompt = `
Japanese Edo moji calligraphy.
Bold black ink brush lettering.
White background.
Traditional Japanese festival signboard style.
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

    return NextResponse.json({
      imageUrl: Array.isArray(output) ? output[0] : output,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "画像生成に失敗しました。" },
      { status: 500 }
    );
  }
}
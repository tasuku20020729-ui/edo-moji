import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_VISION_MODEL =
  process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const char = String(body.char || "").trim();
    const rawImageUrl = String(body.rawImageUrl || "");

    if (!char || !rawImageUrl.startsWith("data:image")) {
      return NextResponse.json(
        { error: "文字または画像がありません" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        centerBiasX: 0,
        centerBiasY: 0,
        compactness: 0.5,
        verticality: 0.5,
        strokeThickness: 0.5,
        leftRightBalance: 0.5,
        topBottomBalance: 0.5,
        characterImpression: "OPENAI_API_KEY未設定のため標準値",
        guideInstructions: [],
      });
    }

    const completion = await openai.chat.completions.create({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは日本の楷書体・筆跡分析AIです。実筆画像を見て、故人の筆跡特徴を数値化してください。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
対象文字: ${char}

この実筆画像を解析し、下書き生成に使える筆跡特徴をJSONのみで返してください。

{
  "centerBiasX": 0,
  "centerBiasY": 0,
  "compactness": 0.5,
  "verticality": 0.5,
  "strokeThickness": 0.5,
  "leftRightBalance": 0.5,
  "topBottomBalance": 0.5,
  "characterImpression": "短い説明",
  "guideInstructions": ["指示1", "指示2"]
}

数値範囲:
- centerBiasX: -0.12〜0.12
- centerBiasY: -0.12〜0.12
- compactness: 0〜1
- verticality: 0〜1
- strokeThickness: 0〜1
- leftRightBalance: 0〜1
- topBottomBalance: 0〜1
`,
            },
            {
              type: "image_url",
              image_url: {
                url: rawImageUrl,
              },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("筆跡解析の応答が空です");
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      centerBiasX:
        typeof parsed.centerBiasX === "number" ? parsed.centerBiasX : 0,
      centerBiasY:
        typeof parsed.centerBiasY === "number" ? parsed.centerBiasY : 0,
      compactness:
        typeof parsed.compactness === "number" ? parsed.compactness : 0.5,
      verticality:
        typeof parsed.verticality === "number" ? parsed.verticality : 0.5,
      strokeThickness:
        typeof parsed.strokeThickness === "number"
          ? parsed.strokeThickness
          : 0.5,
      leftRightBalance:
        typeof parsed.leftRightBalance === "number"
          ? parsed.leftRightBalance
          : 0.5,
      topBottomBalance:
        typeof parsed.topBottomBalance === "number"
          ? parsed.topBottomBalance
          : 0.5,
      characterImpression: String(parsed.characterImpression || ""),
      guideInstructions: Array.isArray(parsed.guideInstructions)
        ? parsed.guideInstructions.map(String)
        : [],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "筆跡解析に失敗しました",
      },
      { status: 500 }
    );
  }
}
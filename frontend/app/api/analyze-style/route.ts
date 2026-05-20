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

    const targetText = String(body.targetText || "").trim();
    const samples = Array.isArray(body.samples) ? body.samples : [];

    if (!targetText) {
      return NextResponse.json(
        { error: "targetText がありません" },
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

    const limitedSamples = samples.slice(-6);

    const imageContents = limitedSamples
      .filter((sample: any) => sample.rawImageUrl || sample.imageUrl)
      .map((sample: any) => {
        return [
          {
            type: "text" as const,
            text: `サンプル文字: ${String(sample.char || "")}`,
          },
          {
            type: "image_url" as const,
            image_url: {
              url: String(sample.rawImageUrl || sample.imageUrl),
            },
          },
        ];
      })
      .flat();

    const completion = await openai.chat.completions.create({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content:
            "あなたは日本の楷書体・筆跡分析AIです。実筆画像から文字の重心、余白、縦横バランス、線の太さ、構成の癖を分析し、下書き生成に使える数値JSONを返してください。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
対象文字:
${targetText}

実筆サンプル画像を解析して、対象文字の下書き生成に反映すべき筆跡特徴をJSONで返してください。

必ずJSONのみで返してください。

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

数値の意味:
- centerBiasX: -0.12〜0.12。右寄りなら正、左寄りなら負
- centerBiasY: -0.12〜0.12。下寄りなら正、上寄りなら負
- compactness: 0〜1。詰まった字なら高い
- verticality: 0〜1。縦長なら高い
- strokeThickness: 0〜1。太い筆なら高い
- leftRightBalance: 0〜1。左右構造で左を太く大きくするなら低め、右を大きくするなら高め
- topBottomBalance: 0〜1。上下構造で上を大きくするなら低め、下を大きくするなら高め
`,
            },
            ...imageContents,
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
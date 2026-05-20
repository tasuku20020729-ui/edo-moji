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

    const expected = String(body.expected || "").trim();
    const guideImage = String(body.guideImage || "");

    if (!expected || !guideImage.startsWith("data:image")) {
      return NextResponse.json(
        { error: "指定文字または下書き画像がありません" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        matched: true,
        readable: true,
        reason: "OPENAI_API_KEY未設定のため下書き検証をスキップしました",
        correction: {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          strokeWidthMultiplier: 1,
        },
      });
    }

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
            "あなたは日本語の楷書体・漢字構造判定の専門家です。下書き画像が指定文字として読めるか、欠画・余計な画・別字化の危険がないかを厳密に判定してください。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
指定文字: ${expected}

この下書き画像が、指定文字として安全に読めるか判定してください。

必ずJSONのみで返してください。

{
  "matched": true,
  "readable": true,
  "reason": "理由",
  "correction": {
    "scale": 1.0,
    "offsetX": 0,
    "offsetY": 0,
    "strokeWidthMultiplier": 1.0
  }
}

correctionの意味:
- scale: 文字全体の拡大縮小。0.85〜1.15
- offsetX: 横位置補正。-0.08〜0.08
- offsetY: 縦位置補正。-0.08〜0.08
- strokeWidthMultiplier: 下書き線幅補正。0.7〜1.8

判定基準:
- 指定文字と違う可能性がある場合 matched=false
- 欠画や余計な線がある場合 matched=false
- 読みにくい場合 readable=false
`,
            },
            {
              type: "image_url",
              image_url: {
                url: guideImage,
              },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("下書き検証の応答が空です");
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "下書き検証に失敗しました",
      },
      { status: 500 }
    );
  }
}
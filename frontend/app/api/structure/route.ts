import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";

type KanjiLayout = "single" | "left-right" | "top-bottom" | "surround";

function normalizeLayout(value: unknown): KanjiLayout {
  if (
    value === "single" ||
    value === "left-right" ||
    value === "top-bottom" ||
    value === "surround"
  ) {
    return value;
  }

  return "single";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(body.text || "").trim();

    const sampleChars = Array.isArray(body.sampleChars)
      ? body.sampleChars.map(String)
      : [];

    if (!text) {
      return NextResponse.json(
        { error: "文字がありません" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        radicals: [text],
        layout: "single",
        source: "fallback",
      });
    }

    const completion = await openai.chat.completions.create({
      model: OPENAI_TEXT_MODEL,
      temperature: 0,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: "あなたは日本語漢字構造解析AIです。",
        },
        {
          role: "user",
          content: `
対象文字:
${text}

登録済み実筆サンプル:
${sampleChars.join("、") || "なし"}

目的:
故人の実筆サンプルから部首や構成要素を再利用して、対象文字の下書きを作る。

必ずJSONのみ返してください。

{
  "radicals": [],
  "layout": "single | left-right | top-bottom | surround",
  "reason": ""
}

ルール:
- 登録済みサンプルにある文字や部品を優先して分解してください。
- 画像合成しやすい単位に分けてください。
- 分解できない場合だけ radicals=[対象文字], layout="single" にしてください。

例:
橋
↓
{
  "radicals": ["木","喬"],
  "layout": "left-right",
  "reason": "木へんと喬の左右構造"
}
`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("LLM応答が空です");
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      radicals:
        Array.isArray(parsed.radicals) && parsed.radicals.length > 0
          ? parsed.radicals.map(String)
          : [text],
      layout: normalizeLayout(parsed.layout),
      source: "llm",
      reason: String(parsed.reason || ""),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "構造解析失敗",
      },
      { status: 500 }
    );
  }
}
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

    const imageUrl = String(body.imageUrl || "");

    if (!imageUrl.startsWith("data:image")) {
      return NextResponse.json(
        {
          error: "画像がありません",
        },
        {
          status: 400,
        }
      );
    }

    const completion =
      await openai.chat.completions.create({
        model: OPENAI_VISION_MODEL,

        temperature: 0,

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content:
              "あなたは日本語文字画像ノイズ検査AIです。",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
この画像が、
白背景に黒文字のみの
綺麗な文字画像として適切か判定してください。

{
  "ok": true,
  "noiseLevel": 0.1,
  "needsRepair": false,
  "reason": "短い説明"
}

noiseLevel:
0〜1

0:
ノイズ無し

1:
非常にノイズ多い
`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
      });

    const content =
      completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("ノイズ判定失敗");
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      ok: Boolean(parsed.ok),
      noiseLevel:
        typeof parsed.noiseLevel ===
        "number"
          ? parsed.noiseLevel
          : 0,
      needsRepair: Boolean(
        parsed.needsRepair
      ),
      reason: String(parsed.reason || ""),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ノイズ判定失敗",
      },
      {
        status: 500,
      }
    );
  }
}
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
        shouldInvert: false,
        threshold: 150,
        backgroundThreshold: 220,
        cropPadding: 0.12,
        rotationDeg: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        reason: "OPENAI_API_KEY未設定のため標準補正",
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
            "あなたは日本の楷書体画像補正AIです。実筆画像を安全に白背景・黒文字へ補正するためのパラメータだけをJSONで返してください。文字の形は絶対に変えない方針で判断してください。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
対象文字: ${char}

この画像を、下書き・学習サンプル登録に使いやすい白背景の黒文字画像に補正したいです。

画像そのものは編集せず、補正パラメータだけJSONで返してください。

{
  "shouldInvert": false,
  "threshold": 150,
  "backgroundThreshold": 220,
  "cropPadding": 0.12,
  "rotationDeg": 0,
  "scale": 1.0,
  "offsetX": 0,
  "offsetY": 0,
  "reason": "短い理由"
}

値の意味:
- shouldInvert: 背景が黒く文字が白い場合 true
- threshold: 文字本体だけを黒判定する閾値 60〜230
- backgroundThreshold: 背景を白化する閾値 160〜250
- cropPadding: 文字領域の余白 0.05〜0.25
- rotationDeg: 傾き補正角度 -15〜15
- scale: 最終配置の拡大率 0.8〜1.15
- offsetX: 横位置補正 -0.1〜0.1
- offsetY: 縦位置補正 -0.1〜0.1

重要:
- 背景の影・紙端・写真の黒い領域は文字として扱わない
- 文字の墨部分だけを黒判定する
- 右端・左端・上下端に接している黒い塊は背景ノイズの可能性が高い
- 真っ黒四角にならないようにする
- 文字形を変えない
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
      throw new Error("画像補正解析の応答が空です");
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      shouldInvert: Boolean(parsed.shouldInvert),
      threshold:
        typeof parsed.threshold === "number"
          ? Math.min(230, Math.max(60, parsed.threshold))
          : 150,
      backgroundThreshold:
        typeof parsed.backgroundThreshold === "number"
          ? Math.min(250, Math.max(160, parsed.backgroundThreshold))
          : 220,
      cropPadding:
        typeof parsed.cropPadding === "number"
          ? Math.min(0.25, Math.max(0.05, parsed.cropPadding))
          : 0.12,
      rotationDeg:
        typeof parsed.rotationDeg === "number"
          ? Math.min(15, Math.max(-15, parsed.rotationDeg))
          : 0,
      scale:
        typeof parsed.scale === "number"
          ? Math.min(1.15, Math.max(0.8, parsed.scale))
          : 1,
      offsetX:
        typeof parsed.offsetX === "number"
          ? Math.min(0.1, Math.max(-0.1, parsed.offsetX))
          : 0,
      offsetY:
        typeof parsed.offsetY === "number"
          ? Math.min(0.1, Math.max(-0.1, parsed.offsetY))
          : 0,
      reason: String(parsed.reason || ""),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "画像補正解析に失敗しました",
      },
      { status: 500 }
    );
  }
}
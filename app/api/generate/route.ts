import Replicate from "replicate";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REPLICATE_MODEL =
  process.env.REPLICATE_MODEL || "tasuku20020729-ui/kaisho-artisan-lora";

const CANDIDATE_COUNT = Number(process.env.CANDIDATE_COUNT || 3);
const MAX_GENERATION_ROUNDS = Number(process.env.MAX_GENERATION_ROUNDS || 3);
const OPENAI_VISION_MODEL =
  process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");

  if (!base64) {
    throw new Error("画像データが不正です");
  }

  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const buffer = Buffer.from(base64, "base64");

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  return new Blob([arrayBuffer], { type: mime });
}

async function fetchImageAsDataUrl(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("AI画像URLの取得に失敗しました");
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:image/png;base64,${base64}`;
}

async function outputToBase64Image(output: unknown) {
  const first = Array.isArray(output) ? output[0] : output;

  if (!first) {
    throw new Error("Replicateの出力が空です");
  }

  if (typeof first === "string") {
    if (first.startsWith("data:image")) {
      return first;
    }

    return fetchImageAsDataUrl(first);
  }

  if (typeof first === "object" && first !== null && "url" in first) {
    const urlValue = (first as { url?: unknown }).url;

    const url =
      typeof urlValue === "function"
        ? (urlValue as () => URL)().toString()
        : String(urlValue);

    return fetchImageAsDataUrl(url);
  }

  throw new Error("Replicateの出力形式を処理できません");
}

type VerifyResult = {
  matched: boolean;
  detectedText: string;
  confidence: number;
  reason: string;
  correctionPrompt: string;
};

async function verifyCharacterWithVision(
  imageUrl: string,
  expectedText: string
): Promise<VerifyResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      matched: true,
      detectedText: expectedText,
      confidence: 0,
      reason: "OPENAI_API_KEY未設定のため検証をスキップしました",
      correctionPrompt: "",
    };
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
          "あなたは日本語の楷書体・漢字判定の専門家です。画像に書かれている文字が指定文字と完全一致するか厳密に判定してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
指定文字: ${expectedText}

画像に書かれている文字を判定してください。

必ずJSONのみで返してください。

{
  "matched": true,
  "detectedText": "画像から読める文字",
  "confidence": 0.0,
  "reason": "判定理由",
  "correctionPrompt": "不一致の場合、次回生成で直すための英語プロンプト"
}

判定基準:
- 指定文字と完全一致する場合のみ matched=true
- 似ている別字は matched=false
- 欠画、余計な画、別漢字化は matched=false
- 読めない場合は matched=false
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

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI Visionの応答が空です");
  }

  const parsed = JSON.parse(content) as Partial<VerifyResult>;

  return {
    matched: Boolean(parsed.matched),
    detectedText: String(parsed.detectedText || ""),
    confidence:
      typeof parsed.confidence === "number" ? parsed.confidence : 0,
    reason: String(parsed.reason || ""),
    correctionPrompt: String(parsed.correctionPrompt || ""),
  };
}

function buildInput(
  text: string,
  guideImage: string,
  seed: number,
  correctionPrompt: string
) {
  return {
    prompt: `
KAIARTISAN style.

Japanese handwritten formal Kaisho calligraphy by the trained artisan.

The guide image is a handwriting guide.
Use the guide to preserve the exact Japanese character.
Use the trained LoRA style to reconstruct the full brush form.

Important:
- Intended Japanese text: ${text}
- Preserve the exact Japanese character identity.
- Never generate another kanji.
- Never add extra characters.
- Never remove characters.
- Never add unnecessary strokes.
- Never remove important strokes.
- Preserve readable formal Kaisho structure.
- Reproduce the artisan's character shape.
- Reproduce the artisan's stroke balance.
- Reproduce the artisan's center of gravity.
- Reproduce the artisan's spacing between strokes.
- Reproduce the artisan's proportions.
- Strongly apply the trained LoRA handwriting style.
- Add brush thickness using the trained artisan style.
- Add strong brush pressure.
- Add natural tome, hane, and harai.
- Output solid black filled brush strokes.
- Do not output hollow strokes.
- Do not output outline text.
- Make it look handwritten by the trained artisan.
- Human handwritten imbalance is allowed.
- Suitable for tombstone engraving.
- Clean white background.
- Black ink only.
- No paper texture.
- No decoration.
- No seal.
- No signature.

Correction feedback from previous verification:
${correctionPrompt || "None"}
`,

    negative_prompt: `
wrong kanji,
different kanji,
different character,
extra character,
missing character,
extra stroke,
missing stroke,
missing important stroke,
unreadable text,
collapsed structure,
hollow text,
outline text,
white fill,
white inside strokes,
outlined strokes,
border only,
thin stroke,
digital font,
computer font,
typography,
perfect vector font,
plain mincho font,
mincho balance,
font-like shape,
gray ink,
dirty background,
paper texture,
colored background,
red seal,
stamp,
signature,
decoration,
noise,
blur,
low quality
`,

    image: dataUrlToBlob(guideImage),
    aspect_ratio: "1:1",
    output_format: "png",

    guidance_scale: 10.0,
    prompt_strength: 0.82,

    seed,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(body.text || "").trim();
    const useAI = Boolean(body.useAI);
    const guideImage = String(body.guideImage || "");

    if (!text) {
      return NextResponse.json(
        { error: "文字を入力してください" },
        { status: 400 }
      );
    }

    if (!guideImage || !guideImage.startsWith("data:image")) {
      return NextResponse.json(
        { error: "下書き画像がありません" },
        { status: 400 }
      );
    }

    if (!useAI) {
      return NextResponse.json({
        imageUrl: guideImage,
        imageUrls: [guideImage],
        verificationResults: [],
      });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Vercelの環境変数 REPLICATE_API_TOKEN が設定されていません",
        },
        { status: 500 }
      );
    }

    const candidateCount = Math.max(1, Math.min(CANDIDATE_COUNT, 12));
    const maxRounds = Math.max(1, Math.min(MAX_GENERATION_ROUNDS, 5));

    const acceptedImageUrls: string[] = [];
    const allImageUrls: string[] = [];
    const verificationResults: Array<
      VerifyResult & {
        imageUrl: string;
        seed: number;
        round: number;
      }
    > = [];

    let correctionPrompt = "";

    for (let round = 1; round <= maxRounds; round++) {
      const seeds = Array.from({ length: candidateCount }, () =>
        Math.floor(Math.random() * 1_000_000_000)
      );

      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];

        const output = await replicate.run(REPLICATE_MODEL as any, {
          input: buildInput(text, guideImage, seed, correctionPrompt),
        });

        const imageUrl = await outputToBase64Image(output);
        allImageUrls.push(imageUrl);

        const verify = await verifyCharacterWithVision(imageUrl, text);

        verificationResults.push({
          ...verify,
          imageUrl,
          seed,
          round,
        });

        if (verify.matched && verify.confidence >= 0.65) {
          acceptedImageUrls.push(imageUrl);
        } else if (verify.correctionPrompt) {
          correctionPrompt = verify.correctionPrompt;
        } else {
          correctionPrompt = `
The previous output was not recognized as the intended Japanese text "${text}".
Keep the exact same character identity.
Do not change it into another kanji.
Avoid missing strokes and extra strokes.
`;
        }

        if (i < seeds.length - 1) {
          await sleep(11_000);
        }
      }

      if (acceptedImageUrls.length > 0) {
        break;
      }

      if (round < maxRounds) {
        await sleep(11_000);
      }
    }

    const finalImageUrls =
      acceptedImageUrls.length > 0 ? acceptedImageUrls : allImageUrls;

    return NextResponse.json({
      imageUrl: finalImageUrls[0],
      imageUrls: finalImageUrls,
      allImageUrls,
      verificationResults,
      verified: acceptedImageUrls.length > 0,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "生成に失敗しました",
      },
      { status: 500 }
    );
  }
}
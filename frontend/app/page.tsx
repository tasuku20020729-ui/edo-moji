"use client";

import { useEffect, useRef, useState } from "react";

import { PDFDocument } from "pdf-lib";

import {
  createCharacterSample,
} from "../lib/characterAnalysis";

import {
  createAIBinarizedSampleImage,
  type AIBinarizeParams,
} from "../lib/aiBinarize";

import {
  composeGuideFromSamples,
  type StructureData,
} from "../lib/guideComposer";

import {
  saveCharacterSampleToFirebase,
} from "../lib/sampleStorage";

import {
  loadSamplesFromFirebase,
  loadRadicalPartsFromFirebase,
} from "../lib/loadSamples";

import {
  createRadicalPartImage,
} from "../lib/radicalPartImage";

import type {
  CharacterSample,
  HandwritingStyleAnalysis,
  RadicalPartSample,
  KanjiLayout,
} from "../types/character";

const CANVAS_SIZE = 1024;

type CandidateResult = {
  url: string;
  score: number;
  index: number;
};

type GuideCorrection = {
  scale: number;
  offsetX: number;
  offsetY: number;
  strokeWidthMultiplier: number;
};

const DEFAULT_GUIDE_CORRECTION: GuideCorrection = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  strokeWidthMultiplier: 1,
};

const DEFAULT_HANDWRITING_STYLE: HandwritingStyleAnalysis = {
  centerBiasX: 0,
  centerBiasY: 0,
  compactness: 0.5,
  verticality: 0.5,
  strokeThickness: 0.5,
  leftRightBalance: 0.5,
  topBottomBalance: 0.5,
  characterImpression: "",
  guideInstructions: [],
};

export default function Home() {
  const [text, setText] = useState("");

  const [useAI, setUseAI] = useState(true);

  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(false);

  const [candidates, setCandidates] = useState<
    CandidateResult[]
  >([]);

  const [samples, setSamples] = useState<
    CharacterSample[]
  >([]);

  const [radicalParts, setRadicalParts] = useState<
    RadicalPartSample[]
  >([]);

  const [sampleChar, setSampleChar] = useState("");

  const [sampleFile, setSampleFile] =
    useState<File | null>(null);

  const [sampleLoading, setSampleLoading] =
    useState(false);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    Promise.all([
      loadSamplesFromFirebase(),
      loadRadicalPartsFromFirebase(),
    ])
      .then(([loadedSamples, loadedParts]) => {
        setSamples(loadedSamples);
        setRadicalParts(loadedParts);
      })
      .catch(console.error);
  }, []);

  function findExactSample(value: string) {
    const target = value.trim();

    if (!target) return null;

    const reversed = [...samples].reverse();

    return (
      reversed.find(
        (sample) => sample.char === target
      ) || null
    );
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>(
      (resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);

        img.onerror = () =>
          reject(
            new Error(
              "画像の読み込みに失敗しました"
            )
          );

        img.src = src;
      }
    );
  }

  async function analyzeStructureForText(
    value: string
  ): Promise<StructureData> {
    const response = await fetch(
      "/api/structure",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          text: value,

          sampleChars:
            samples.map(
              (sample) =>
                sample.char
            ),
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "文字構造解析失敗"
      );
    }

    return {
      radicals: Array.isArray(
        data.radicals
      )
        ? data.radicals.map(
            String
          )
        : [value],

      layout:
        data.layout ===
          "left-right" ||
        data.layout ===
          "top-bottom" ||
        data.layout ===
          "surround" ||
        data.layout === "single"
          ? data.layout
          : "single",

      source: String(
        data.source || "llm"
      ),

      reason: String(
        data.reason || ""
      ),
    };
  }

  async function analyzeHandwritingStyleForGuide(
    value: string
  ): Promise<HandwritingStyleAnalysis> {
    const exactSample =
      findExactSample(value);

    if (exactSample?.styleAnalysis) {
      return exactSample.styleAnalysis;
    }

    return DEFAULT_HANDWRITING_STYLE;
  }

  async function drawGuideFromSample(
    sample: CharacterSample,
    correction: GuideCorrection
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return "";

    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    const img = await loadImage(
      sample.imageUrl
    );

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";

    ctx.fillRect(
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );

    const scale = correction.scale;

    const drawSize =
      CANVAS_SIZE * scale;

    const x =
      (CANVAS_SIZE - drawSize) / 2 +
      CANVAS_SIZE *
        correction.offsetX;

    const y =
      (CANVAS_SIZE - drawSize) / 2 +
      CANVAS_SIZE *
        correction.offsetY;

    ctx.drawImage(
      img,
      x,
      y,
      drawSize,
      drawSize
    );

    return canvas.toDataURL("image/png");
  }

  async function applyGuideCorrection(
    guideImage: string,
    correction: GuideCorrection
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return guideImage;

    const ctx = canvas.getContext("2d");

    if (!ctx) return guideImage;

    const img = await loadImage(
      guideImage
    );

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";

    ctx.fillRect(
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );

    const scale = correction.scale;

    const drawSize =
      CANVAS_SIZE * scale;

    const x =
      (CANVAS_SIZE - drawSize) / 2 +
      CANVAS_SIZE *
        correction.offsetX;

    const y =
      (CANVAS_SIZE - drawSize) / 2 +
      CANVAS_SIZE *
        correction.offsetY;

    ctx.drawImage(
      img,
      x,
      y,
      drawSize,
      drawSize
    );

    return canvas.toDataURL("image/png");
  }

  async function verifyGuideImage(
    guideImage: string
  ) {
    try {
      const response = await fetch(
        "/api/verify-guide",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            expected: text,
            guideImage,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        return {
          matched: true,
          readable: true,
          correction:
            DEFAULT_GUIDE_CORRECTION,
        };
      }

      return {
        matched: Boolean(
          data.matched
        ),

        readable: Boolean(
          data.readable
        ),

        correction: {
          scale:
            typeof data.correction
              ?.scale ===
            "number"
              ? data.correction
                  .scale
              : 1,

          offsetX:
            typeof data.correction
              ?.offsetX ===
            "number"
              ? data.correction
                  .offsetX
              : 0,

          offsetY:
            typeof data.correction
              ?.offsetY ===
            "number"
              ? data.correction
                  .offsetY
              : 0,

          strokeWidthMultiplier:
            typeof data.correction
              ?.strokeWidthMultiplier ===
            "number"
              ? data
                  .correction
                  .strokeWidthMultiplier
              : 1,
        },
      };
    } catch (error) {
      console.error(error);

      return {
        matched: true,
        readable: true,
        correction:
          DEFAULT_GUIDE_CORRECTION,
      };
    }
  }

  async function createInferredGuideImage(
    correction: GuideCorrection
  ) {
    const exactSample =
      findExactSample(text);

    // 登録済み文字はそのまま使用
    if (exactSample) {
      return drawGuideFromSample(
        exactSample,
        correction
      );
    }

    // 未登録文字は部首合成
    const structure =
      await analyzeStructureForText(
        text
      );

    const handwritingStyle =
      await analyzeHandwritingStyleForGuide(
        text
      );

    const composedGuide =
      await composeGuideFromSamples(
        structure,
        samples,
        radicalParts,
        CANVAS_SIZE,
        handwritingStyle
      );

    if (!composedGuide) {
      throw new Error(
        "部首合成に失敗しました"
      );
    }

    return applyGuideCorrection(
      composedGuide,
      correction
    );
  }

  async function createVerifiedGuideImage() {
    let correction =
      DEFAULT_GUIDE_CORRECTION;

    for (
      let i = 0;
      i < 2;
      i++
    ) {
      const guideImage =
        await createInferredGuideImage(
          correction
        );

      const result =
        await verifyGuideImage(
          guideImage
        );

      if (
        result.matched &&
        result.readable
      ) {
        return guideImage;
      }

      correction =
        result.correction;
    }

    return createInferredGuideImage(
      correction
    );
  }

  async function registerSample() {
    const char = sampleChar.trim();

    if (!char) {
      alert("登録する文字を入力してください");
      return;
    }

    if (!sampleFile) {
      alert("実筆画像を選択してください");
      return;
    }

    setSampleLoading(true);

    try {
      const rawImageUrl =
        await new Promise<string>(
          (
            resolve,
            reject
          ) => {
            const reader =
              new FileReader();

            reader.onload =
              () =>
                resolve(
                  String(
                    reader.result
                  )
                );

            reader.onerror =
              () =>
                reject(
                  new Error(
                    "ファイル読み込み失敗"
                  )
                );

            reader.readAsDataURL(
              sampleFile
            );
          }
        );

      const binarizeResponse =
        await fetch(
          "/api/analyze-binarize",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              char,
              rawImageUrl,
            }),
          }
        );

      const binarizeParams: AIBinarizeParams =
        await binarizeResponse.json();

      if (
        !binarizeResponse.ok
      ) {
        throw new Error(
          binarizeParams.reason ||
            "AI補正解析に失敗しました"
        );
      }

      let processedImageUrl =
        await createAIBinarizedSampleImage(
          rawImageUrl,
          binarizeParams
        );

      const repairResponse =
        await fetch(
          "/api/repair-sample",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              char,
              rawImageUrl,
              processedImageUrl,
            }),
          }
        );

      const repairData =
        await repairResponse.json();

      if (
        repairResponse.ok &&
        repairData.imageUrl
      ) {
        processedImageUrl =
          repairData.imageUrl;
      }

      const analysisResponse =
        await fetch(
          "/api/analyze-sample",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              char,
              rawImageUrl,
            }),
          }
        );

      const styleAnalysis =
        await analysisResponse.json();

      if (
        !analysisResponse.ok
      ) {
        throw new Error(
          styleAnalysis.error ||
            "筆跡解析に失敗しました"
        );
      }

      const structure =
        await analyzeStructureForText(
          char
        );

      const radicals =
        structure.radicals;

      const layout =
        structure.layout as KanjiLayout;

      const sample =
        await createCharacterSample(
          sampleFile,
          char,
          styleAnalysis,
          binarizeParams,
          processedImageUrl,
          radicals,
          layout
        );

      const partImages =
        await Promise.all(
          radicals.map(
            (
              radical,
              index
            ) =>
              createRadicalPartImage(
                processedImageUrl,
                layout,
                index,
                radicals.length
              ).then(
                (
                  partImageUrl
                ) => ({
                  parentChar:
                    char,

                  radical,

                  radicalIndex:
                    index,

                  totalRadicals:
                    radicals.length,

                  layout,

                  imageUrl:
                    partImageUrl,

                  rawImageUrl,

                  styleAnalysis,
                })
              )
          )
        );

      await saveCharacterSampleToFirebase(
        sample,
        partImages
      );

      const [
        loadedSamples,
        loadedParts,
      ] =
        await Promise.all([
          loadSamplesFromFirebase(),
          loadRadicalPartsFromFirebase(),
        ]);

      setSamples(
        loadedSamples
      );

      setRadicalParts(
        loadedParts
      );

      setSampleChar("");
      setSampleFile(null);

      alert(
        `「${char}」と部首パーツをFirebaseへ登録しました`
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "登録に失敗しました"
      );
    } finally {
      setSampleLoading(false);
    }
  }

  async function generate() {
    if (!text.trim()) {
      alert("文字を入力してください");
      return;
    }

    setLoading(true);

    try {
      const guideImage =
        await createVerifiedGuideImage();

      if (!useAI) {
        setImageUrl(guideImage);
        return;
      }

      const response = await fetch(
        "/api/generate",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            text,
            useAI,
            guideImage,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "生成失敗"
        );
      }

      const urls =
        Array.isArray(
          data.imageUrls
        )
          ? data.imageUrls
          : data.imageUrl
          ? [data.imageUrl]
          : [];

      if (urls.length === 0) {
        throw new Error(
          "生成画像がありません"
        );
      }

      const nextCandidates =
        urls.map(
          (
            url: string,
            index: number
          ) => ({
            url,
            score:
              urls.length -
              index,
            index:
              index + 1,
          })
        );

      setCandidates(
        nextCandidates
      );

      setImageUrl(urls[0]);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "生成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (
      !canvasRef.current ||
      !imageUrl
    )
      return;

    const pdfDoc =
      await PDFDocument.create();

    const page =
      pdfDoc.addPage([
        CANVAS_SIZE,
        CANVAS_SIZE,
      ]);

    const pngData =
      canvasRef.current.toDataURL(
        "image/png"
      );

    const imageBytes =
      await fetch(pngData).then(
        (res) =>
          res.arrayBuffer()
      );

    const image =
      await pdfDoc.embedPng(
        imageBytes
      );

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
    });

    const pdfBytes =
      await pdfDoc.save();

    const blob = new Blob(
      [pdfBytes as BlobPart],
      {
        type: "application/pdf",
      }
    );

    const url =
      URL.createObjectURL(
        blob
      );

    const a =
      document.createElement(
        "a"
      );

    a.href = url;

    a.download = `${text}.pdf`;

    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="container">
      <h1>
        楷書体ジェネレーター
      </h1>

      <section className="samplePanel">
        <h2>
          実筆サンプル登録
        </h2>

        <div className="sampleControls">
          <input
            type="text"
            placeholder="登録する文字"
            value={sampleChar}
            onChange={(e) =>
              setSampleChar(
                e.target.value
              )
            }
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setSampleFile(
                e.target.files?.[0] ||
                  null
              )
            }
          />

          <button
            onClick={
              registerSample
            }
            disabled={
              sampleLoading
            }
          >
            {sampleLoading
              ? "解析中..."
              : "登録"}
          </button>
        </div>
      </section>

      <section className="controls">
        <input
          type="text"
          placeholder="生成する文字"
          value={text}
          onChange={(e) =>
            setText(
              e.target.value
            )
          }
        />

        <label className="toggle">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) =>
              setUseAI(
                e.target.checked
              )
            }
          />

          LoRAでAI生成
        </label>

        <button
          onClick={generate}
          disabled={loading}
        >
          {loading
            ? "生成中..."
            : "生成"}
        </button>
      </section>

      <div className="preview">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
        />
      </div>

      {imageUrl && (
        <div className="downloads">
          <button
            onClick={
              downloadPdf
            }
          >
            PDF保存
          </button>
        </div>
      )}
    </main>
  );
}
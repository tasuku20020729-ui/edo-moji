"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

import { createCharacterSample } from "../lib/characterAnalysis";

import {
  composeGuideFromSamples,
  type StructureData,
} from "../lib/guideComposer";

import type {
  CharacterSample,
  HandwritingStyleAnalysis,
} from "../types/character";

import { createAIBinarizedSampleImage } from "../lib/aiBinarize";

import type { AIBinarizeParams } from "../lib/aiBinarize";

const CANVAS_SIZE = 1024;

const SAMPLE_STORAGE_KEY =
  "kaisho-artisan-character-samples";

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

  const [useAI, setUseAI] = useState(false);

  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(false);

  const [candidates, setCandidates] = useState<
    CandidateResult[]
  >([]);

  const [samples, setSamples] = useState<
    CharacterSample[]
  >([]);

  const [sampleChar, setSampleChar] = useState("");

  const [sampleFile, setSampleFile] =
    useState<File | null>(null);

  const [sampleLoading, setSampleLoading] =
    useState(false);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(
      SAMPLE_STORAGE_KEY
    );

    if (!raw) return;

    try {
      const parsed = JSON.parse(
        raw
      ) as CharacterSample[];

      setSamples(parsed);
    } catch {
      localStorage.removeItem(
        SAMPLE_STORAGE_KEY
      );
    }
  }, []);

  function saveSamples(
    nextSamples: CharacterSample[]
  ) {
    setSamples(nextSamples);

    localStorage.setItem(
      SAMPLE_STORAGE_KEY,
      JSON.stringify(nextSamples)
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
      const rawImageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("ファイル読み込み失敗"));

        reader.readAsDataURL(sampleFile);
      });

      const binarizeResponse = await fetch("/api/analyze-binarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          char,
          rawImageUrl,
        }),
      });

      const binarizeParams = await binarizeResponse.json();

      if (!binarizeResponse.ok) {
        throw new Error(
          binarizeParams.error || "AI補正解析に失敗しました"
        );
      }

      let processedImageUrl = await createAIBinarizedSampleImage(
        rawImageUrl,
        binarizeParams
      );

      const noiseResponse = await fetch("/api/check-noise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: processedImageUrl,
        }),
      });

      const noiseData = await noiseResponse.json();

      if (
        !noiseResponse.ok ||
        noiseData.needsRepair ||
        Number(noiseData.noiseLevel || 0) > 0.35
      ) {
        const repairResponse = await fetch("/api/repair-sample", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            char,
            rawImageUrl,
            processedImageUrl,
          }),
        });

        const repairData = await repairResponse.json();

        if (!repairResponse.ok || !repairData.imageUrl) {
          throw new Error(
            repairData.error || "AI画像補正に失敗しました"
          );
        }

        processedImageUrl = repairData.imageUrl;
      }

      const verifyResponse = await fetch("/api/verify-guide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expected: char,
          guideImage: processedImageUrl,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (
        verifyResponse.ok &&
        (!verifyData.matched || !verifyData.readable)
      ) {
        throw new Error(
          `AI補正後の文字が「${char}」として安全に読めません。別の画像で登録してください。`
        );
      }

      const analysisResponse = await fetch("/api/analyze-sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          char,
          rawImageUrl,
        }),
      });

      const styleAnalysis = await analysisResponse.json();

      if (!analysisResponse.ok) {
        throw new Error(
          styleAnalysis.error || "筆跡解析に失敗しました"
        );
      }

      const sample = await createCharacterSample(
        sampleFile,
        char,
        styleAnalysis,
        binarizeParams,
        processedImageUrl
      );

      const nextSamples = [...samples, sample];

      saveSamples(nextSamples);

      setSampleChar("");
      setSampleFile(null);

      alert(`「${char}」をAI補正して登録しました`);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "実筆サンプル登録に失敗しました"
      );
    } finally {
      setSampleLoading(false);
    }
  }

  function deleteSample(id: string) {
    const nextSamples = samples.filter(
      (sample) => sample.id !== id
    );

    saveSamples(nextSamples);
  }

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

  function hardBinarizeCanvas() {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const imageData = ctx.getImageData(
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );

    const data = imageData.data;

    for (
      let i = 0;
      i < data.length;
      i += 4
    ) {
      const gray =
        data[i] * 0.299 +
        data[i + 1] * 0.587 +
        data[i + 2] * 0.114;

      const value =
        gray > 190 ? 255 : 0;

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  async function drawGuideFromSample(
    sample: CharacterSample,
    correction: GuideCorrection
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return "";

    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    const img = await loadImage(sample.imageUrl);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const scale = correction.scale;
    const drawSize = CANVAS_SIZE * scale;

    const x =
      (CANVAS_SIZE - drawSize) / 2 + CANVAS_SIZE * correction.offsetX;

    const y =
      (CANVAS_SIZE - drawSize) / 2 + CANVAS_SIZE * correction.offsetY;

    ctx.drawImage(img, x, y, drawSize, drawSize);

    // 重要:
    // サンプル画像は2値化しない
    return canvas.toDataURL("image/png");
  }

  async function drawFontGuideText(
    correction: GuideCorrection
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return "";

    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";

    ctx.fillRect(
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );

    const chars = Array.from(
      text.trim()
    );

    const fontSize =
      chars.length <= 1
        ? 560
        : chars.length <= 2
        ? 420
        : chars.length <= 4
        ? 290
        : 200;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "black";

    ctx.font = `100 ${
      fontSize * correction.scale
    }px "Yu Mincho", serif`;

    const spacing =
      fontSize * 1.05;

    const startY =
      CANVAS_SIZE / 2 -
      ((chars.length - 1) *
        spacing) /
        2;

    chars.forEach(
      (char, index) => {
        ctx.fillText(
          char,
          CANVAS_SIZE / 2 +
            CANVAS_SIZE *
              correction.offsetX,
          startY +
            index * spacing +
            CANVAS_SIZE *
              correction.offsetY
        );
      }
    );

    hardBinarizeCanvas();

    return canvas.toDataURL("image/png");
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
    if (samples.length === 0) {
      return DEFAULT_HANDWRITING_STYLE;
    }

    const exactSample = findExactSample(value);

    if (exactSample?.styleAnalysis) {
      return exactSample.styleAnalysis;
    }

    try {
      const response = await fetch("/api/analyze-style", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetText: value,
          samples: samples.map((sample) => ({
            char: sample.char,
            rawImageUrl: sample.rawImageUrl,
            styleAnalysis: sample.styleAnalysis,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return DEFAULT_HANDWRITING_STYLE;
      }

      return {
        centerBiasX:
          typeof data.centerBiasX === "number" ? data.centerBiasX : 0,
        centerBiasY:
          typeof data.centerBiasY === "number" ? data.centerBiasY : 0,
        compactness:
          typeof data.compactness === "number" ? data.compactness : 0.5,
        verticality:
          typeof data.verticality === "number" ? data.verticality : 0.5,
        strokeThickness:
          typeof data.strokeThickness === "number" ? data.strokeThickness : 0.5,
        leftRightBalance:
          typeof data.leftRightBalance === "number"
            ? data.leftRightBalance
            : 0.5,
        topBottomBalance:
          typeof data.topBottomBalance === "number"
            ? data.topBottomBalance
            : 0.5,
        characterImpression: String(data.characterImpression || ""),
        guideInstructions: Array.isArray(data.guideInstructions)
          ? data.guideInstructions.map(String)
          : [],
      };
    } catch (error) {
      console.error(error);
      return DEFAULT_HANDWRITING_STYLE;
    }
  }

  async function applyGuideCorrection(
    guideImage: string,
    correction: GuideCorrection
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return guideImage;

    const ctx = canvas.getContext("2d");

    if (!ctx) return guideImage;

    const img = await loadImage(guideImage);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const scale = correction.scale;
    const drawSize = CANVAS_SIZE * scale;

    const x =
      (CANVAS_SIZE - drawSize) / 2 + CANVAS_SIZE * correction.offsetX;

    const y =
      (CANVAS_SIZE - drawSize) / 2 + CANVAS_SIZE * correction.offsetY;

    ctx.drawImage(img, x, y, drawSize, drawSize);

    // 重要:
    // 合成ガイドも2値化しない
    return canvas.toDataURL("image/png");
  }

  async function createInferredGuideImage(
    correction: GuideCorrection
  ) {
    const exactSample =
      findExactSample(text);

    if (exactSample) {
      return drawGuideFromSample(
        exactSample,
        correction
      );
    }

    try {
      const [
        structure,
        handwritingStyle,
      ] = await Promise.all([
        analyzeStructureForText(
          text
        ),

        analyzeHandwritingStyleForGuide(
          text
        ),
      ]);

      const composedGuide =
        await composeGuideFromSamples(
          structure,
          samples,
          CANVAS_SIZE,
          handwritingStyle
        );

      if (composedGuide) {
        return applyGuideCorrection(
          composedGuide,
          correction
        );
      }
    } catch (error) {
      console.error(error);
    }

    return drawFontGuideText(
      correction
    );
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

      if (!guideImage) {
        throw new Error(
          "下書き画像生成失敗"
        );
      }

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

  async function generate() {
    if (!text.trim()) {
      alert("文字を入力してください");
      return;
    }

    setLoading(true);

    try {
      const guideImage =
        await createVerifiedGuideImage();

      if (!guideImage) {
        throw new Error(
          "下書き画像生成失敗"
        );
      }

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

      await drawDataUrlToPreview(
        urls[0]
      );
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

  async function drawDataUrlToPreview(
    src: string
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const img = await loadImage(
      src
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

    ctx.drawImage(
      img,
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );
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
        (res) => res.arrayBuffer()
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
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download = `${text}.pdf`;

    a.click();

    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    if (
      !canvasRef.current ||
      !imageUrl
    )
      return;

    const url =
      canvasRef.current.toDataURL(
        "image/png"
      );

    const a =
      document.createElement("a");

    a.href = url;

    a.download = `${text}.png`;

    a.click();
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

        {samples.length > 0 && (
          <div className="sampleList">
            {samples.map(
              (sample) => (
                <div
                  key={sample.id}
                  className="sampleCard"
                >
                  <img
                    src={
                      sample.imageUrl
                    }
                    alt={
                      sample.char
                    }
                  />

                  <div>
                    <strong>
                      {
                        sample.char
                      }
                    </strong>

                    <small>
                      {
                        sample.name
                      }
                    </small>
                  </div>

                  <button
                    onClick={() =>
                      deleteSample(
                        sample.id
                      )
                    }
                  >
                    削除
                  </button>
                </div>
              )
            )}
          </div>
        )}
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
              downloadPng
            }
          >
            PNG保存
          </button>

          <button
            onClick={
              downloadPdf
            }
          >
            PDF保存
          </button>
        </div>
      )}

      {candidates.length >
        0 && (
        <section className="candidates">
          <h2>
            候補一覧
          </h2>

          <div className="candidateGrid">
            {candidates.map(
              (
                candidate
              ) => (
                <button
                  key={
                    candidate.url
                  }
                  className={
                    imageUrl ===
                    candidate.url
                      ? "candidate selected"
                      : "candidate"
                  }
                  onClick={() =>
                    setImageUrl(
                      candidate.url
                    )
                  }
                >
                  <img
                    src={
                      candidate.url
                    }
                    alt="candidate"
                  />

                  <span>
                    候補{" "}
                    {
                      candidate.index
                    }
                  </span>
                </button>
              )
            )}
          </div>
        </section>
      )}
    </main>
  );
}
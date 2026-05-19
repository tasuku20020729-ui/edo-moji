"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

const CANVAS_SIZE = 1024;

type CandidateResult = {
  url: string;
  score: number;
  index: number;
};

export default function Home() {
  const [text, setText] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  function drawGuideText() {
    const canvas = canvasRef.current;
    if (!canvas) return "";

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const chars = Array.from(text.trim());

    const fontSize =
      chars.length <= 1
        ? 560
        : chars.length <= 2
        ? 420
        : chars.length <= 4
        ? 290
        : chars.length <= 6
        ? 230
        : chars.length <= 8
        ? 185
        : 150;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `100 ${fontSize}px "Yu Mincho", "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif`;

    ctx.fillStyle = "black";
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, fontSize * 0.003);

    const verticalSpacing = fontSize * 1.08;
    const startY =
      CANVAS_SIZE / 2 - ((chars.length - 1) * verticalSpacing) / 2;

    chars.forEach((char, index) => {
      const y = startY + index * verticalSpacing;

      ctx.fillText(char, CANVAS_SIZE / 2, y);
      ctx.strokeText(char, CANVAS_SIZE / 2, y);
    });

    hardBinarizeCanvas();

    return canvas.toDataURL("image/png");
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));

      img.src = src;
    });
  }

  function hardBinarizeImageData(imageData: ImageData) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray =
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      const value = gray > 190 ? 255 : 0;

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    return imageData;
  }

  function hardBinarizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.putImageData(hardBinarizeImageData(imageData), 0, 0);
  }

  function darkenGrayInk() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray =
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      if (gray < 235) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function fillSmallWhiteHoles() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < CANVAS_SIZE - 1; y++) {
      for (let x = 1; x < CANVAS_SIZE - 1; x++) {
        const idx = (y * CANVAS_SIZE + x) * 4;

        if (copy[idx] === 255) {
          let blackCount = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const nidx = ((y + ky) * CANVAS_SIZE + (x + kx)) * 4;

              if (copy[nidx] === 0) {
                blackCount++;
              }
            }
          }

          if (blackCount >= 6) {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function removeTinyBlackNoise() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < CANVAS_SIZE - 1; y++) {
      for (let x = 1; x < CANVAS_SIZE - 1; x++) {
        const idx = (y * CANVAS_SIZE + x) * 4;

        if (copy[idx] === 0) {
          let blackCount = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const nidx = ((y + ky) * CANVAS_SIZE + (x + kx)) * 4;

              if (copy[nidx] === 0) {
                blackCount++;
              }
            }
          }

          if (blackCount <= 2) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function postProcessForTombstone() {
    darkenGrayInk();

    for (let i = 0; i < 3; i++) {
      fillSmallWhiteHoles();
    }

    removeTinyBlackNoise();

    hardBinarizeCanvas();
  }

  async function drawImageToCanvas(src: string) {
    const canvas = canvasRef.current;
    if (!canvas) return "";

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const img = await loadImage(src);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    postProcessForTombstone();

    return canvas.toDataURL("image/png");
  }

  async function drawDataUrlToPreview(src: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = await loadImage(src);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  async function getBlackMaskFromDataUrl(src: string) {
    const img = await loadImage(src);

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas取得に失敗しました");
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    hardBinarizeImageData(imageData);

    const data = imageData.data;
    const mask = new Uint8Array(CANVAS_SIZE * CANVAS_SIZE);

    for (let i = 0; i < mask.length; i++) {
      const p = i * 4;
      mask[i] = data[p] === 0 ? 1 : 0;
    }

    return mask;
  }

  function dilateMask(mask: Uint8Array, radius: number) {
    const result = new Uint8Array(mask.length);

    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const idx = y * CANVAS_SIZE + x;

        if (!mask[idx]) continue;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (
              nx >= 0 &&
              ny >= 0 &&
              nx < CANVAS_SIZE &&
              ny < CANVAS_SIZE
            ) {
              result[ny * CANVAS_SIZE + nx] = 1;
            }
          }
        }
      }
    }

    return result;
  }

  function scoreCandidate(candidateMask: Uint8Array, guideMask: Uint8Array) {
    const guideWide = dilateMask(guideMask, 36);

    let black = 0;
    let overlap = 0;

    let xSum = 0;
    let ySum = 0;

    let minX = CANVAS_SIZE;
    let minY = CANVAS_SIZE;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < CANVAS_SIZE; y++) {
      for (let x = 0; x < CANVAS_SIZE; x++) {
        const idx = y * CANVAS_SIZE + x;

        if (candidateMask[idx]) {
          black++;
          xSum += x;
          ySum += y;

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);

          if (guideWide[idx]) {
            overlap++;
          }
        }
      }
    }

    if (black === 0) {
      return -999999;
    }

    const blackRatio = black / (CANVAS_SIZE * CANVAS_SIZE);
    const overlapRatio = overlap / black;

    const cx = xSum / black;
    const cy = ySum / black;

    const centerPenalty =
      Math.abs(cx - CANVAS_SIZE / 2) / CANVAS_SIZE +
      Math.abs(cy - CANVAS_SIZE / 2) / CANVAS_SIZE;

    const width = maxX - minX;
    const height = maxY - minY;
    const sizeRatio = (width * height) / (CANVAS_SIZE * CANVAS_SIZE);

    const blackPenalty =
      blackRatio < 0.025 ? 0.6 : blackRatio > 0.42 ? 0.8 : 0;

    const sizePenalty =
      sizeRatio < 0.08 ? 0.5 : sizeRatio > 0.7 ? 0.5 : 0;

    return (
      overlapRatio * 2.0 -
      centerPenalty * 1.4 -
      blackPenalty -
      sizePenalty +
      blackRatio * 0.35
    );
  }

  async function buildScoredCandidates(
    guideImage: string,
    imageUrls: string[]
  ) {
    const guideMask = await getBlackMaskFromDataUrl(guideImage);

    const results: CandidateResult[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const processed = await drawImageToCanvas(imageUrls[i]);
      const candidateMask = await getBlackMaskFromDataUrl(processed);
      const score = scoreCandidate(candidateMask, guideMask);

      results.push({
        url: processed,
        score,
        index: i + 1,
      });
    }

    results.sort((a, b) => b.score - a.score);

    return results;
  }

  async function generate() {
    if (!text.trim()) {
      alert("文字を入力してください");
      return;
    }

    setLoading(true);
    setCandidates([]);
    setImageUrl("");

    try {
      const guideImage = drawGuideText();

      if (!guideImage) {
        throw new Error("下書き画像の作成に失敗しました");
      }

      if (!useAI) {
        setImageUrl(guideImage);
        setCandidates([]);
        return;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          useAI,
          guideImage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "生成に失敗しました");
      }

      const imageUrls: string[] = Array.isArray(data.imageUrls)
        ? data.imageUrls
        : data.imageUrl
        ? [data.imageUrl]
        : [];

      if (imageUrls.length === 0) {
        throw new Error("AI画像が返されませんでした");
      }

      const scoredCandidates = await buildScoredCandidates(
        guideImage,
        imageUrls
      );

      setCandidates(scoredCandidates);
      setImageUrl(scoredCandidates[0].url);

      await drawDataUrlToPreview(scoredCandidates[0].url);
    } catch (error) {
      console.error(error);

      alert(error instanceof Error ? error.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function selectCandidate(url: string) {
    setImageUrl(url);
    await drawDataUrlToPreview(url);
  }

  async function downloadPdf() {
    if (!canvasRef.current || !imageUrl) return;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([CANVAS_SIZE, CANVAS_SIZE]);

    const pngData = canvasRef.current.toDataURL("image/png");
    const imageBytes = await fetch(pngData).then((res) => res.arrayBuffer());
    const image = await pdfDoc.embedPng(imageBytes);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
    });

    const pdfBytes = await pdfDoc.save();

    const blob = new Blob([pdfBytes as BlobPart], {
      type: "application/pdf",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${text}.pdf`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    if (!canvasRef.current || !imageUrl) return;

    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");

    a.href = url;
    a.download = `${text}.png`;
    a.click();
  }

  return (
    <main className="container">
      <h1>楷書体ジェネレーター</h1>

      <div className="controls">
        <input
          type="text"
          placeholder="例：田、杉、坂本、保育"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <label className="toggle">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
          />
          自作LoRAでAI生成
        </label>

        <button onClick={generate} disabled={loading}>
          {loading ? "生成中..." : "生成"}
        </button>

        {loading && useAI && (
          <p>
            複数候補を順番に生成し、自動スコアリングしています。
            数十秒〜数分かかる場合があります。
          </p>
        )}

        {!loading && candidates.length > 0 && (
          <p>{candidates.length}枚の候補をスコア順に並べました。</p>
        )}
      </div>

      <div className="preview">
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} />
      </div>

      {imageUrl && (
        <div className="downloads">
          <button onClick={downloadPng}>PNG保存</button>
          <button onClick={downloadPdf}>PDF保存</button>
        </div>
      )}

      {candidates.length > 0 && (
        <section className="candidates">
          <h2>候補一覧</h2>

          <div className="candidateGrid">
            {candidates.map((candidate, displayIndex) => (
              <button
                key={`${candidate.index}-${candidate.score}`}
                type="button"
                className={
                  imageUrl === candidate.url
                    ? "candidate selected"
                    : "candidate"
                }
                onClick={() => selectCandidate(candidate.url)}
              >
                <img
                  src={candidate.url}
                  alt={`候補${candidate.index}`}
                />

                <span>
                  {displayIndex === 0
                    ? "おすすめ"
                    : `候補 ${displayIndex + 1}`}
                </span>

                <small>
                  元候補 {candidate.index} / スコア{" "}
                  {candidate.score.toFixed(3)}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
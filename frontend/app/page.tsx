"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

const CANVAS_SIZE = 1024;

export default function Home() {
  const [text, setText] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

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
        ? 540
        : chars.length <= 2
        ? 400
        : chars.length <= 4
        ? 280
        : chars.length <= 6
        ? 220
        : chars.length <= 8
        ? 180
        : 150;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // AIが筆跡を乗せやすいよう、下書きは太すぎない骨格にする
    ctx.font = `500 ${fontSize}px "Yu Mincho", "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif`;

    ctx.fillStyle = "black";
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 以前より細くする。太すぎるとAIが下書きをそのままなぞる
    ctx.lineWidth = Math.max(4, fontSize * 0.018);

    const verticalSpacing = fontSize * 1.08;
    const startY =
      CANVAS_SIZE / 2 - ((chars.length - 1) * verticalSpacing) / 2;

    chars.forEach((char, index) => {
      const y = startY + index * verticalSpacing;

      ctx.strokeText(char, CANVAS_SIZE / 2, y);
      ctx.fillText(char, CANVAS_SIZE / 2, y);
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

  function hardBinarizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const value = gray > 180 ? 255 : 0;

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function darkenGrayInk() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

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

              if (copy[nidx] === 0) blackCount++;
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

              if (copy[nidx] === 0) blackCount++;
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
    // AIの筆跡を残しつつ、墓石用に黒ベタ化
    darkenGrayInk();

    for (let i = 0; i < 2; i++) {
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

  async function generate() {
    if (!text.trim()) {
      alert("文字を入力してください");
      return;
    }

    setLoading(true);

    try {
      const guideImage = drawGuideText();

      if (!guideImage) {
        throw new Error("下書き画像の作成に失敗しました");
      }

      if (!useAI) {
        setImageUrl(guideImage);
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

      if (!data.imageUrl) {
        throw new Error("AI画像が返されませんでした");
      }

      const finalImage = await drawImageToCanvas(data.imageUrl);
      setImageUrl(finalImage);
    } catch (error) {
      console.error(error);

      alert(error instanceof Error ? error.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
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
    </main>
  );
}
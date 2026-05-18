"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

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

    canvas.width = 1024;
    canvas.height = 1024;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const chars = Array.from(text);

    const fontSize =
      chars.length <= 2 ? 260 :
      chars.length <= 4 ? 210 :
      chars.length <= 6 ? 170 :
      chars.length <= 8 ? 140 :
      115;

    ctx.font = `bold ${fontSize}px "Yu Mincho", "Hiragino Mincho ProN", "Yu Gothic", "Meiryo", serif`;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const strokeWidth = Math.max(3, fontSize * 0.025);
    ctx.strokeStyle = "black";
    ctx.lineWidth = strokeWidth;

    const verticalSpacing = fontSize * 1.05;

    const startY =
      canvas.height / 2 -
      ((chars.length - 1) * verticalSpacing) / 2;

    chars.forEach((char, index) => {
      const y = startY + index * verticalSpacing;

      ctx.strokeText(char, canvas.width / 2, y);
      ctx.fillText(char, canvas.width / 2, y);
    });

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

  async function applyArtisanTextureToGuide(
    guideImage: string,
    textureImage: string
  ) {
    const canvas = canvasRef.current;

    if (!canvas) return "";

    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    const guide = await loadImage(guideImage);
    const texture = await loadImage(textureImage);

    canvas.width = 1024;
    canvas.height = 1024;

    const guideCanvas = document.createElement("canvas");
    guideCanvas.width = 1024;
    guideCanvas.height = 1024;

    const guideCtx = guideCanvas.getContext("2d");
    if (!guideCtx) return "";

    guideCtx.fillStyle = "white";
    guideCtx.fillRect(0, 0, 1024, 1024);
    guideCtx.drawImage(guide, 0, 0, 1024, 1024);

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 1024;
    textureCanvas.height = 1024;

    const textureCtx = textureCanvas.getContext("2d");
    if (!textureCtx) return "";

    textureCtx.fillStyle = "white";
    textureCtx.fillRect(0, 0, 1024, 1024);
    textureCtx.drawImage(texture, 0, 0, 1024, 1024);

    const guideData = guideCtx.getImageData(0, 0, 1024, 1024);
    const textureData = textureCtx.getImageData(0, 0, 1024, 1024);

    const output = ctx.createImageData(1024, 1024);

    for (let i = 0; i < guideData.data.length; i += 4) {
      const gr = guideData.data[i];
      const gg = guideData.data[i + 1];
      const gb = guideData.data[i + 2];

      const tr = textureData.data[i];
      const tg = textureData.data[i + 1];
      const tb = textureData.data[i + 2];

      const guideGray = (gr + gg + gb) / 3;
      const textureGray = (tr + tg + tb) / 3;

      const guideInk = Math.max(0, Math.min(1, (245 - guideGray) / 245));

      if (guideInk <= 0.04) {
        output.data[i] = 255;
        output.data[i + 1] = 255;
        output.data[i + 2] = 255;
        output.data[i + 3] = 255;
        continue;
      }

      const textureInk = Math.max(0, Math.min(1, (255 - textureGray) / 255));

      const inkStrength =
        0.72 +
        textureInk * 0.28;

      const edgeSoftness = Math.pow(guideInk, 0.72);
      const finalInk = Math.max(0, Math.min(1, edgeSoftness * inkStrength));

      const color = Math.round(255 - finalInk * 255);

      output.data[i] = color;
      output.data[i + 1] = color;
      output.data[i + 2] = color;
      output.data[i + 3] = 255;
    }

    ctx.putImageData(output, 0, 0);

    // 文字形を保ったまま、墨の太さを少し補強
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(canvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";

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

      if (!useAI) {
        setImageUrl(guideImage);
        return;
      }

      const res = await fetch("/api/generate", {
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "生成に失敗しました");
      }

      if (data.imageUrl) {
        const finalImage = await applyArtisanTextureToGuide(
          guideImage,
          data.imageUrl
        );

        setImageUrl(finalImage);
      }
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
    const page = pdfDoc.addPage([1024, 1024]);

    const pngData = canvasRef.current.toDataURL("image/png");

    const imageBytes = await fetch(pngData).then((res) =>
      res.arrayBuffer()
    );

    const image = await pdfDoc.embedPng(imageBytes);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: 1024,
      height: 1024,
    });

    const pdfBytes = await pdfDoc.save();

    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.length);
    const pdfView = new Uint8Array(pdfArrayBuffer);
    pdfView.set(pdfBytes);

    const blob = new Blob([pdfArrayBuffer], {
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
          placeholder="例：小林、金子悠真、修了証書"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <label className="toggle">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
          />
          AI生成を使用
        </label>

        <button onClick={generate} disabled={loading}>
          {loading ? "生成中..." : "生成"}
        </button>
      </div>

      <div className="preview">
        <canvas ref={canvasRef} width={1024} height={1024} />
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
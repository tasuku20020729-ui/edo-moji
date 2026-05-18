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

    const chars = Array.from(text);

    const fontSize =
      chars.length <= 2
        ? 300
        : chars.length <= 4
        ? 230
        : chars.length <= 6
        ? 185
        : chars.length <= 8
        ? 150
        : 120;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const verticalSpacing = fontSize * 1.02;
    const startY =
      canvas.height / 2 -
      ((chars.length - 1) * verticalSpacing) / 2;

    chars.forEach((char, index) => {
      const y = startY + index * verticalSpacing;

      // 文字ごとに少しだけ不均一にする
      const offsetX = Math.sin(index * 1.7) * 8;
      const rotate = Math.sin(index * 2.1) * 0.035;
      const scaleX = 1 + Math.sin(index * 1.3) * 0.035;
      const scaleY = 1 + Math.cos(index * 1.1) * 0.025;

      ctx.save();

      ctx.translate(canvas.width / 2 + offsetX, y);
      ctx.rotate(rotate);
      ctx.scale(scaleX, scaleY);

      ctx.font = `900 ${fontSize}px "Yu Mincho", "Hiragino Mincho ProN", "Yu Gothic", "Meiryo", serif`;

      // 太めの筆文字下書きにする
      ctx.strokeStyle = "black";
      ctx.fillStyle = "black";
      ctx.lineWidth = Math.max(10, fontSize * 0.065);

      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);

      // わずかに重ねて筆圧っぽくする
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = Math.max(5, fontSize * 0.035);

      ctx.strokeText(char, -3, 2);
      ctx.fillText(char, -2, 1);

      ctx.globalAlpha = 1;

      ctx.restore();
    });

    // 下書き自体に少しだけ墨っぽい欠けを入れる
    const imageData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;

      if (gray < 80) {
        const noise = Math.random();

        // 黒部分の一部を薄くして、完全なPCフォント感を減らす
        if (noise < 0.012) {
          data[i] = 70;
          data[i + 1] = 70;
          data[i + 2] = 70;
        }

        if (noise > 0.994) {
          data[i] = 180;
          data[i + 1] = 180;
          data[i + 2] = 180;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("画像の読み込みに失敗しました"));

      img.src = src;
    });
  }

  async function drawImageToCanvas(src: string) {
    const canvas = canvasRef.current;
    if (!canvas) return "";

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const img = await loadImage(src);

    canvas.width = 1024;
    canvas.height = 1024;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.drawImage(img, 0, 0, 1024, 1024);

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

      if (data.imageUrl) {
        const finalImage = await drawImageToCanvas(data.imageUrl);
        setImageUrl(finalImage);
      }
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
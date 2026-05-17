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

    const fontSize =
      text.length <= 2 ? 240 :
      text.length <= 4 ? 180 :
      text.length <= 6 ? 140 :
      110;

    ctx.font = `bold ${fontSize}px serif`;

    const chars = Array.from(text);

    if (chars.length <= 4) {
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      for (let i = 0; i < 8; i++) {
        ctx.fillText(
          text,
          canvas.width / 2 + i * 0.45,
          canvas.height / 2 + i * 0.45
        );
      }
    } else {
      const lineLength = Math.ceil(chars.length / 2);
      const line1 = chars.slice(0, lineLength).join("");
      const line2 = chars.slice(lineLength).join("");

      ctx.fillText(line1, canvas.width / 2, canvas.height / 2 - fontSize * 0.65);
      ctx.fillText(line2, canvas.width / 2, canvas.height / 2 + fontSize * 0.65);

      for (let i = 0; i < 8; i++) {
        ctx.fillText(
          line1,
          canvas.width / 2 + i * 0.45,
          canvas.height / 2 - fontSize * 0.65 + i * 0.45
        );
        ctx.fillText(
          line2,
          canvas.width / 2 + i * 0.45,
          canvas.height / 2 + fontSize * 0.65 + i * 0.45
        );
      }
    }

    return canvas.toDataURL("image/png");
  }

  async function drawImageToCanvas(src: string) {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    await new Promise<void>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        canvas.width = 1024;
        canvas.height = 1024;

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve();
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      img.src = src;
    });
  }

  async function generate() {
    if (!text.trim()) {
      alert("文字を入力してください");
      return;
    }

    setLoading(true);

    try {
      const guideImage = drawGuideText();

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
        setImageUrl(data.imageUrl);

        if (useAI) {
          await drawImageToCanvas(data.imageUrl);
        }
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
      <h1>江戸文字ジェネレーター</h1>

      <div className="controls">
        <input
          type="text"
          placeholder="例：小林、商売繁盛、祭"
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
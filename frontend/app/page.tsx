"use client";

import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

export default function Home() {
  const [text, setText] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function generate() {
    if (!text) return;

    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          useAI,
        }),
      });

      const data = await res.json();

      if (data.imageUrl && canvasRef.current) {
        setImageUrl(data.imageUrl);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        canvas.width = 1024;
        canvas.height = 1024;

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // =========================
        // AI生成ON
        // =========================

        if (useAI) {
          const img = new Image();

          img.crossOrigin = "anonymous";

          img.onload = () => {
            ctx.drawImage(
              img,
              0,
              0,
              canvas.width,
              canvas.height
            );
          };

          img.onerror = () => {
            alert("AI画像の読み込みに失敗しました");
          };

          img.src = data.imageUrl;
        }

        // =========================
        // AI生成OFF
        // =========================

        else {
          ctx.fillStyle = "black";

          ctx.font = "bold 140px serif";

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.fillText(
            text,
            canvas.width / 2,
            canvas.height / 2
          );

          // 太字感追加

          for (let i = 0; i < 8; i++) {
            ctx.fillText(
              text,
              canvas.width / 2 + i * 0.5,
              canvas.height / 2 + i * 0.5
            );
          }
        }
      }
    } catch (error) {
      console.error(error);

      alert("生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!canvasRef.current) return;

    const pdfDoc = await PDFDocument.create();

    const page = pdfDoc.addPage([1024, 1024]);

    const pngData =
      canvasRef.current.toDataURL("image/png");

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

    const pdfArrayBuffer = new ArrayBuffer(
      pdfBytes.length
    );

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
    if (!canvasRef.current) return;

    const url =
      canvasRef.current.toDataURL("image/png");

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
          placeholder="文字を入力"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <label className="toggle">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) =>
              setUseAI(e.target.checked)
            }
          />
          AI生成を使用
        </label>

        <button
          onClick={generate}
          disabled={loading}
        >
          {loading ? "生成中..." : "生成"}
        </button>
      </div>

      <div className="preview">
        <canvas
          ref={canvasRef}
          width={1024}
          height={1024}
        />
      </div>

      {imageUrl && (
        <div className="downloads">
          <button onClick={downloadPng}>
            PNG保存
          </button>

          <button onClick={downloadPdf}>
            PDF保存
          </button>
        </div>
      )}
    </main>
  );
}
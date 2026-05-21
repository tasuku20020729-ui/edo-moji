import type { KanjiLayout } from "../types/character";

const OUTPUT_SIZE = 1024;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}

function getSourceRect(
  layout: KanjiLayout,
  index: number,
  total: number,
  size: number
) {
  if (layout === "single" || total <= 1) {
    return { sx: 0, sy: 0, sw: size, sh: size };
  }

  if (layout === "left-right") {
    const partWidth = size / total;
    return {
      sx: partWidth * index,
      sy: 0,
      sw: partWidth,
      sh: size,
    };
  }

  if (layout === "top-bottom") {
    const partHeight = size / total;
    return {
      sx: 0,
      sy: partHeight * index,
      sw: size,
      sh: partHeight,
    };
  }

  if (layout === "surround") {
    if (index === 0) {
      return { sx: 0, sy: 0, sw: size, sh: size };
    }

    return {
      sx: size * 0.22,
      sy: size * 0.22,
      sw: size * 0.56,
      sh: size * 0.56,
    };
  }

  return { sx: 0, sy: 0, sw: size, sh: size };
}

export async function createRadicalPartImage(
  processedImageUrl: string,
  layout: KanjiLayout,
  index: number,
  total: number
) {
  const img = await loadImage(processedImageUrl);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = OUTPUT_SIZE;
  sourceCanvas.height = OUTPUT_SIZE;

  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) throw new Error("Canvas取得に失敗しました");

  sourceCtx.fillStyle = "white";
  sourceCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  sourceCtx.drawImage(img, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const crop = getSourceRect(layout, index, total, OUTPUT_SIZE);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = OUTPUT_SIZE;
  outCanvas.height = OUTPUT_SIZE;

  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas取得に失敗しました");

  outCtx.fillStyle = "white";
  outCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const ratio = Math.min(
    (OUTPUT_SIZE * 0.82) / crop.sw,
    (OUTPUT_SIZE * 0.82) / crop.sh
  );

  const dw = crop.sw * ratio;
  const dh = crop.sh * ratio;

  const dx = (OUTPUT_SIZE - dw) / 2;
  const dy = (OUTPUT_SIZE - dh) / 2;

  outCtx.drawImage(
    sourceCanvas,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    dx,
    dy,
    dw,
    dh
  );

  return outCanvas.toDataURL("image/png");
}
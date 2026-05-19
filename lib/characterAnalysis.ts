import type { CharacterSample } from "../types/character";

const ANALYSIS_SIZE = 512;
const OUTPUT_SIZE = 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));

    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));

    img.src = src;
  });
}

function createBinaryMask(imageData: ImageData) {
  const data = imageData.data;
  const mask = new Uint8Array(ANALYSIS_SIZE * ANALYSIS_SIZE);

  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;

    const gray =
      data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;

    mask[i] = gray < 190 ? 1 : 0;
  }

  return mask;
}

function getBlackPixel(mask: Uint8Array, x: number, y: number) {
  if (x < 0 || y < 0 || x >= ANALYSIS_SIZE || y >= ANALYSIS_SIZE) {
    return 0;
  }

  return mask[y * ANALYSIS_SIZE + x];
}

function countTransitions(neighbors: number[]) {
  let count = 0;

  for (let i = 0; i < neighbors.length; i++) {
    const current = neighbors[i];
    const next = neighbors[(i + 1) % neighbors.length];

    if (current === 0 && next === 1) {
      count++;
    }
  }

  return count;
}

function zhangSuenThinning(original: Uint8Array) {
  const mask = new Uint8Array(original);
  let changed = true;
  let iteration = 0;

  while (changed && iteration < 80) {
    changed = false;
    iteration++;

    for (let step = 0; step < 2; step++) {
      const toRemove: number[] = [];

      for (let y = 1; y < ANALYSIS_SIZE - 1; y++) {
        for (let x = 1; x < ANALYSIS_SIZE - 1; x++) {
          const idx = y * ANALYSIS_SIZE + x;

          if (mask[idx] !== 1) continue;

          const p2 = getBlackPixel(mask, x, y - 1);
          const p3 = getBlackPixel(mask, x + 1, y - 1);
          const p4 = getBlackPixel(mask, x + 1, y);
          const p5 = getBlackPixel(mask, x + 1, y + 1);
          const p6 = getBlackPixel(mask, x, y + 1);
          const p7 = getBlackPixel(mask, x - 1, y + 1);
          const p8 = getBlackPixel(mask, x - 1, y);
          const p9 = getBlackPixel(mask, x - 1, y - 1);

          const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];

          const blackCount = neighbors.reduce((sum, v) => sum + v, 0);
          const transitions = countTransitions(neighbors);

          if (blackCount < 2 || blackCount > 6) continue;
          if (transitions !== 1) continue;

          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }

          toRemove.push(idx);
        }
      }

      if (toRemove.length > 0) {
        changed = true;

        for (const idx of toRemove) {
          mask[idx] = 0;
        }
      }
    }
  }

  return mask;
}

function createBlackImageDataUrl(mask: Uint8Array) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas取得に失敗しました");
  }

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const scale = OUTPUT_SIZE / ANALYSIS_SIZE;

  ctx.fillStyle = "black";

  for (let y = 0; y < ANALYSIS_SIZE; y++) {
    for (let x = 0; x < ANALYSIS_SIZE; x++) {
      if (mask[y * ANALYSIS_SIZE + x]) {
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  return canvas.toDataURL("image/png");
}

function analyzeMask(mask: Uint8Array) {
  let blackCount = 0;

  let xSum = 0;
  let ySum = 0;

  let minX = ANALYSIS_SIZE;
  let minY = ANALYSIS_SIZE;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < ANALYSIS_SIZE; y++) {
    for (let x = 0; x < ANALYSIS_SIZE; x++) {
      const idx = y * ANALYSIS_SIZE + x;

      if (!mask[idx]) continue;

      blackCount++;
      xSum += x;
      ySum += y;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (blackCount === 0) {
    return {
      bbox: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      center: {
        x: 0.5,
        y: 0.5,
      },
      margins: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      blackRatio: 0,
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  return {
    bbox: {
      x: minX / ANALYSIS_SIZE,
      y: minY / ANALYSIS_SIZE,
      width: width / ANALYSIS_SIZE,
      height: height / ANALYSIS_SIZE,
    },
    center: {
      x: xSum / blackCount / ANALYSIS_SIZE,
      y: ySum / blackCount / ANALYSIS_SIZE,
    },
    margins: {
      top: minY / ANALYSIS_SIZE,
      right: (ANALYSIS_SIZE - maxX) / ANALYSIS_SIZE,
      bottom: (ANALYSIS_SIZE - maxY) / ANALYSIS_SIZE,
      left: minX / ANALYSIS_SIZE,
    },
    blackRatio: blackCount / (ANALYSIS_SIZE * ANALYSIS_SIZE),
  };
}

export async function createCharacterSample(
  file: File,
  char: string
): Promise<CharacterSample> {
  const imageUrl = await readFileAsDataUrl(file);
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas取得に失敗しました");
  }

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

  const ratio = Math.min(
    ANALYSIS_SIZE / img.width,
    ANALYSIS_SIZE / img.height
  );

  const drawWidth = img.width * ratio;
  const drawHeight = img.height * ratio;

  const x = (ANALYSIS_SIZE - drawWidth) / 2;
  const y = (ANALYSIS_SIZE - drawHeight) / 2;

  ctx.drawImage(img, x, y, drawWidth, drawHeight);

  const imageData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const mask = createBinaryMask(imageData);
  const skeletonMask = zhangSuenThinning(mask);

  const normalizedImageUrl = createBlackImageDataUrl(mask);
  const skeletonUrl = createBlackImageDataUrl(skeletonMask);
  const analysis = analyzeMask(mask);

  return {
    id: crypto.randomUUID(),
    char,
    name: file.name,
    imageUrl: normalizedImageUrl,
    skeletonUrl,
    createdAt: new Date().toISOString(),
    ...analysis,
  };
}
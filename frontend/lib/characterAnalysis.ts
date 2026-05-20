import type { CharacterSample } from "../types/character";

const ANALYSIS_SIZE = 512;
const OUTPUT_SIZE = 1024;

type Mask = Uint8Array;

function createMask(size: number): Mask {
  return new Uint8Array(size);
}

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

function getGray(r: number, g: number, b: number) {
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114);
}

function otsuThreshold(grays: Uint8Array) {
  const hist: number[] = new Array(256).fill(0);

  for (let i = 0; i < grays.length; i++) {
    hist[grays[i]]++;
  }
  const total = grays.length;

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * hist[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 180;

  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * hist[i];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

function removeBorderNoise(mask: Mask): Mask {
  const result = createMask(mask.length);
  result.set(mask);

  const visited = createMask(mask.length);
  const queue: number[] = [];

  function push(x: number, y: number) {
    if (x < 0 || y < 0 || x >= ANALYSIS_SIZE || y >= ANALYSIS_SIZE) return;

    const idx = y * ANALYSIS_SIZE + x;

    if (visited[idx]) return;
    if (!result[idx]) return;

    visited[idx] = 1;
    queue.push(x, y);
  }

  for (let x = 0; x < ANALYSIS_SIZE; x++) {
    push(x, 0);
    push(x, ANALYSIS_SIZE - 1);
  }

  for (let y = 0; y < ANALYSIS_SIZE; y++) {
    push(0, y);
    push(ANALYSIS_SIZE - 1, y);
  }

  while (queue.length > 0) {
    const y = queue.pop()!;
    const x = queue.pop()!;

    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let i = 0; i < result.length; i++) {
    if (visited[i]) {
      result[i] = 0;
    }
  }

  return result;
}

function removeSmallNoise(mask: Mask): Mask {
  const result = createMask(mask.length);
  result.set(mask);

  for (let y = 1; y < ANALYSIS_SIZE - 1; y++) {
    for (let x = 1; x < ANALYSIS_SIZE - 1; x++) {
      const idx = y * ANALYSIS_SIZE + x;

      if (!mask[idx]) continue;

      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (kx === 0 && ky === 0) continue;

          const nidx = (y + ky) * ANALYSIS_SIZE + (x + kx);

          if (mask[nidx]) {
            count++;
          }
        }
      }

      if (count <= 1) {
        result[idx] = 0;
      }
    }
  }

  return result;
}

function findLargestComponent(mask: Mask): Mask {
  const visited = createMask(mask.length);
  let bestPixels: number[] = [];

  for (let y = 0; y < ANALYSIS_SIZE; y++) {
    for (let x = 0; x < ANALYSIS_SIZE; x++) {
      const startIdx = y * ANALYSIS_SIZE + x;

      if (!mask[startIdx] || visited[startIdx]) continue;

      const queue: number[] = [x, y];
      const pixels: number[] = [];

      visited[startIdx] = 1;

      while (queue.length > 0) {
        const cy = queue.pop()!;
        const cx = queue.pop()!;
        const idx = cy * ANALYSIS_SIZE + cx;

        pixels.push(idx);

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= ANALYSIS_SIZE ||
            ny >= ANALYSIS_SIZE
          ) {
            continue;
          }

          const nidx = ny * ANALYSIS_SIZE + nx;

          if (visited[nidx] || !mask[nidx]) continue;

          visited[nidx] = 1;
          queue.push(nx, ny);
        }
      }

      if (pixels.length > bestPixels.length) {
        bestPixels = pixels;
      }
    }
  }

  const result = createMask(mask.length);

  for (const idx of bestPixels) {
    result[idx] = 1;
  }

  return result;
}

function createBinaryMask(imageData: ImageData): Mask {
  const data = imageData.data;
  const grays = new Uint8Array(ANALYSIS_SIZE * ANALYSIS_SIZE);

  for (let i = 0; i < grays.length; i++) {
    const p = i * 4;
    grays[i] = getGray(data[p], data[p + 1], data[p + 2]);
  }

  const otsu = otsuThreshold(grays);
  const threshold = Math.max(55, Math.min(210, otsu - 8));

  const rawMask = createMask(ANALYSIS_SIZE * ANALYSIS_SIZE);

  for (let i = 0; i < grays.length; i++) {
    rawMask[i] = grays[i] < threshold ? 1 : 0;
  }

  const borderRemovedMask = removeBorderNoise(rawMask);
  const noiseRemovedMask = removeSmallNoise(borderRemovedMask);
  const largestComponentMask = findLargestComponent(noiseRemovedMask);

  return largestComponentMask;
}

function getBlackPixel(mask: Mask, x: number, y: number) {
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

function zhangSuenThinning(original: Mask): Mask {
  const mask = createMask(original.length);
  mask.set(original);

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

function createBlackImageDataUrl(mask: Mask) {
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

function analyzeMask(mask: Mask) {
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
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      center: { x: 0.5, y: 0.5 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
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
    (ANALYSIS_SIZE * 0.88) / img.width,
    (ANALYSIS_SIZE * 0.88) / img.height
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
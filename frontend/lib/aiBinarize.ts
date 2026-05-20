export type AIBinarizeParams = {
  shouldInvert: boolean;
  threshold: number;
  backgroundThreshold: number;
  cropPadding: number;
  rotationDeg: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  reason?: string;
};

const OUTPUT_SIZE = 1024;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}

function getGray(r: number, g: number, b: number) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function createMaskFromImageData(
  imageData: ImageData,
  threshold: number,
  shouldInvert: boolean
) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const gray = getGray(data[p], data[p + 1], data[p + 2]);

    mask[i] = shouldInvert
      ? gray > threshold
        ? 1
        : 0
      : gray < threshold
      ? 1
      : 0;
  }

  return mask;
}

function removeBorderConnectedNoise(mask: Uint8Array, width: number, height: number) {
  const result = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];

  function push(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const idx = y * width + x;

    if (visited[idx]) return;
    if (!result[idx]) return;

    visited[idx] = 1;
    queue.push(x, y);
  }

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }

  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
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

function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels: number
) {
  const visited = new Uint8Array(mask.length);
  const result = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;

      if (!mask[startIdx] || visited[startIdx]) continue;

      const queue: number[] = [x, y];
      const pixels: number[] = [];

      visited[startIdx] = 1;

      while (queue.length > 0) {
        const cy = queue.pop()!;
        const cx = queue.pop()!;
        const idx = cy * width + cx;

        pixels.push(idx);

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

          const nidx = ny * width + nx;

          if (visited[nidx] || !mask[nidx]) continue;

          visited[nidx] = 1;
          queue.push(nx, ny);
        }
      }

      if (pixels.length >= minPixels) {
        for (const idx of pixels) {
          result[idx] = 1;
        }
      }
    }
  }

  return result;
}

function findMainTextBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      if (!mask[idx]) continue;

      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) {
    return {
      x: 0,
      y: 0,
      width,
      height,
    };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function renderMaskToCanvas(mask: Uint8Array, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas取得に失敗しました");
  }

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const value = mask[i] ? 0 : 255;

    data[p] = value;
    data[p + 1] = value;
    data[p + 2] = value;
    data[p + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

function countBlack(mask: Uint8Array) {
  let count = 0;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) count++;
  }

  return count;
}

export async function createAIBinarizedSampleImage(
  rawImageUrl: string,
  params: AIBinarizeParams
) {
  const img = await loadImage(rawImageUrl);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = OUTPUT_SIZE;
  tempCanvas.height = OUTPUT_SIZE;

  const tempCtx = tempCanvas.getContext("2d");

  if (!tempCtx) {
    throw new Error("Canvas取得に失敗しました");
  }

  tempCtx.fillStyle = "white";
  tempCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  tempCtx.save();
  tempCtx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
  tempCtx.rotate((params.rotationDeg * Math.PI) / 180);

  const fitRatio = Math.min(
    (OUTPUT_SIZE * 0.9) / img.width,
    (OUTPUT_SIZE * 0.9) / img.height
  );

  const drawWidth = img.width * fitRatio;
  const drawHeight = img.height * fitRatio;

  tempCtx.drawImage(
    img,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );

  tempCtx.restore();

  const tempImageData = tempCtx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  let mask = createMaskFromImageData(
    tempImageData,
    params.threshold,
    params.shouldInvert
  );

  // 端に接している影・紙端・背景ノイズを除去
  mask = removeBorderConnectedNoise(mask, OUTPUT_SIZE, OUTPUT_SIZE);

  // 小さい飛び散りノイズを除去
  mask = removeSmallComponents(mask, OUTPUT_SIZE, OUTPUT_SIZE, 80);

  const blackPixels = countBlack(mask);
  const blackRatio = blackPixels / (OUTPUT_SIZE * OUTPUT_SIZE);

  if (blackRatio < 0.005 || blackRatio > 0.55) {
    throw new Error(
      "2値化結果が不安定です。背景が多すぎる、または文字が検出できていません。別の画像で再登録してください。"
    );
  }

  const bounds = findMainTextBounds(mask, OUTPUT_SIZE, OUTPUT_SIZE);

  const padding = Math.max(bounds.width, bounds.height) * params.cropPadding;

  const sx = Math.max(0, bounds.x - padding);
  const sy = Math.max(0, bounds.y - padding);
  const sw = Math.min(OUTPUT_SIZE - sx, bounds.width + padding * 2);
  const sh = Math.min(OUTPUT_SIZE - sy, bounds.height + padding * 2);

  const maskCanvas = renderMaskToCanvas(mask, OUTPUT_SIZE, OUTPUT_SIZE);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = OUTPUT_SIZE;
  outCanvas.height = OUTPUT_SIZE;

  const outCtx = outCanvas.getContext("2d");

  if (!outCtx) {
    throw new Error("Canvas取得に失敗しました");
  }

  outCtx.fillStyle = "white";
  outCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const ratio = Math.min(
    (OUTPUT_SIZE * 0.82 * params.scale) / sw,
    (OUTPUT_SIZE * 0.82 * params.scale) / sh
  );

  const dw = sw * ratio;
  const dh = sh * ratio;

  const dx = (OUTPUT_SIZE - dw) / 2 + OUTPUT_SIZE * params.offsetX;
  const dy = (OUTPUT_SIZE - dh) / 2 + OUTPUT_SIZE * params.offsetY;

  outCtx.drawImage(maskCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

  return outCanvas.toDataURL("image/png");
}
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

function findBlackBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  shouldInvert: boolean
) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const gray = getGray(data[p], data[p + 1], data[p + 2]);
      const isInk = shouldInvert ? gray > threshold : gray < threshold;

      if (isInk) {
        found = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
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
  const bounds = findBlackBounds(
    tempImageData.data,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
    params.threshold,
    params.shouldInvert
  );

  const padding = Math.max(bounds.width, bounds.height) * params.cropPadding;

  const sx = Math.max(0, bounds.x - padding);
  const sy = Math.max(0, bounds.y - padding);
  const sw = Math.min(OUTPUT_SIZE - sx, bounds.width + padding * 2);
  const sh = Math.min(OUTPUT_SIZE - sy, bounds.height + padding * 2);

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

  outCtx.drawImage(tempCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

  const outImageData = outCtx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  const outData = outImageData.data;

  for (let i = 0; i < outData.length; i += 4) {
    const gray = getGray(outData[i], outData[i + 1], outData[i + 2]);

    let value = 255;

    if (params.shouldInvert) {
      value = gray > params.threshold ? 0 : 255;
    } else {
      value = gray < params.threshold ? 0 : 255;
    }

    if (!params.shouldInvert && gray > params.backgroundThreshold) {
      value = 255;
    }

    outData[i] = value;
    outData[i + 1] = value;
    outData[i + 2] = value;
    outData[i + 3] = 255;
  }

  outCtx.putImageData(outImageData, 0, 0);

  return outCanvas.toDataURL("image/png");
}
import type {
  CharacterSample,
  HandwritingStyleAnalysis,
} from "../types/character";

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

function createPreviewImageDataUrl(rawImageUrl: string) {
  return loadImage(rawImageUrl).then((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas取得に失敗しました");
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const ratio = Math.min(
      (OUTPUT_SIZE * 0.88) / img.width,
      (OUTPUT_SIZE * 0.88) / img.height
    );

    const drawWidth = img.width * ratio;
    const drawHeight = img.height * ratio;

    const x = (OUTPUT_SIZE - drawWidth) / 2;
    const y = (OUTPUT_SIZE - drawHeight) / 2;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);

    return canvas.toDataURL("image/png");
  });
}

function createSimpleSkeletonDataUrl(previewUrl: string) {
  return loadImage(previewUrl).then((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas取得に失敗しました");
    }

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const imageData = ctx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray =
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      const value = gray > 200 ? 255 : 0;

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
  });
}

function getDefaultGeometry() {
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

export async function createCharacterSample(
  file: File,
  char: string,
  styleAnalysis: HandwritingStyleAnalysis
): Promise<CharacterSample> {
  const rawImageUrl = await readFileAsDataUrl(file);
  const imageUrl = await createPreviewImageDataUrl(rawImageUrl);
  const skeletonUrl = await createSimpleSkeletonDataUrl(imageUrl);

  return {
    id: crypto.randomUUID(),
    char,
    name: file.name,
    rawImageUrl,
    imageUrl,
    skeletonUrl,
    createdAt: new Date().toISOString(),
    styleAnalysis,
    ...getDefaultGeometry(),
  };
}
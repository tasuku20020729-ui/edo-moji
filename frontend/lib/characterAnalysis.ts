import type {
  CharacterSample,
  HandwritingStyleAnalysis,
} from "../types/character";

import type { AIBinarizeParams } from "./aiBinarize";

const OUTPUT_SIZE = 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));

    reader.readAsDataURL(file);
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
  styleAnalysis: HandwritingStyleAnalysis,
  binarizeParams: AIBinarizeParams,
  processedImageUrl: string
): Promise<CharacterSample> {
  const rawImageUrl = await readFileAsDataUrl(file);

  return {
    id: crypto.randomUUID(),
    char,
    name: file.name,
    rawImageUrl,
    imageUrl: processedImageUrl,
    skeletonUrl: processedImageUrl,
    createdAt: new Date().toISOString(),
    styleAnalysis,
    binarizeParams,
    ...getDefaultGeometry(),
  };
}
import type {
  CharacterSample,
  HandwritingStyleAnalysis,
} from "../types/character";

export type KanjiLayout = "single" | "left-right" | "top-bottom" | "surround";

export type StructureData = {
  radicals: string[];
  layout: KanjiLayout;
  source?: string;
  reason?: string;
};

type PartSource = {
  sample: CharacterSample;
  radical: string;
};

const DEFAULT_STYLE: HandwritingStyleAnalysis = {
  centerBiasX: 0,
  centerBiasY: 0,
  compactness: 0.5,
  verticality: 0.5,
  strokeThickness: 0.5,
  leftRightBalance: 0.5,
  topBottomBalance: 0.5,
  characterImpression: "",
  guideInstructions: [],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));

    img.src = src;
  });
}

function hardBinarizeCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray =
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

    const value = gray > 190 ? 255 : 0;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function findPartSource(
  radical: string,
  samples: CharacterSample[]
): PartSource | null {
  const reversed = [...samples].reverse();

  const exact = reversed.find((sample) => sample.char === radical);

  if (exact) {
    return {
      sample: exact,
      radical,
    };
  }

  const partial = reversed.find(
    (sample) => sample.char.includes(radical) || radical.includes(sample.char)
  );

  if (partial) {
    return {
      sample: partial,
      radical,
    };
  }

  return null;
}

function getTargetRect(
  layout: KanjiLayout,
  index: number,
  total: number,
  size: number,
  style: HandwritingStyleAnalysis = DEFAULT_STYLE
) {
  const compact = clamp(style.compactness, 0, 1);
  const verticality = clamp(style.verticality, 0, 1);
  const leftRightBalance = clamp(style.leftRightBalance, 0, 1);
  const topBottomBalance = clamp(style.topBottomBalance, 0, 1);

  const margin = size * (0.08 - compact * 0.04);
  const heightBoost = 1 + (verticality - 0.5) * 0.18;

  if (layout === "single" || total <= 1) {
    const base = size - margin * 2;

    return {
      dx: margin + size * style.centerBiasX,
      dy: margin + size * style.centerBiasY,
      dw: base,
      dh: base * heightBoost,
    };
  }

  if (layout === "left-right") {
    const leftWidth = size * clamp(leftRightBalance, 0.35, 0.55);
    const rightWidth = size - leftWidth;

    if (index === 0) {
      return {
        dx: size * 0.02 + size * style.centerBiasX,
        dy: size * 0.05 + size * style.centerBiasY,
        dw: leftWidth,
        dh: size * 0.9 * heightBoost,
      };
    }

    return {
      dx: leftWidth - size * 0.02 + size * style.centerBiasX,
      dy: size * 0.03 + size * style.centerBiasY,
      dw: rightWidth,
      dh: size * 0.94 * heightBoost,
    };
  }

  if (layout === "top-bottom") {
    const topHeight = size * clamp(topBottomBalance, 0.35, 0.55);
    const bottomHeight = size - topHeight;

    if (index === 0) {
      return {
        dx: size * 0.05 + size * style.centerBiasX,
        dy: size * 0.02 + size * style.centerBiasY,
        dw: size * 0.9,
        dh: topHeight,
      };
    }

    return {
      dx: size * 0.05 + size * style.centerBiasX,
      dy: topHeight - size * 0.02 + size * style.centerBiasY,
      dw: size * 0.9,
      dh: bottomHeight,
    };
  }

  if (layout === "surround") {
    if (index === 0) {
      return {
        dx: size * 0.02 + size * style.centerBiasX,
        dy: size * 0.02 + size * style.centerBiasY,
        dw: size * 0.96,
        dh: size * 0.96,
      };
    }

    return {
      dx: size * 0.24 + size * style.centerBiasX,
      dy: size * 0.24 + size * style.centerBiasY,
      dw: size * 0.52,
      dh: size * 0.52,
    };
  }

  const partWidth = size / total;

  return {
    dx: partWidth * index,
    dy: 0,
    dw: partWidth,
    dh: size,
  };
}

function drawImageContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  target: {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  }
) {
  const srcRatio = img.width / img.height;
  const dstRatio = target.dw / target.dh;

  let dw = target.dw;
  let dh = target.dh;

  if (srcRatio > dstRatio) {
    dh = dw / srcRatio;
  } else {
    dw = dh * srcRatio;
  }

  const dx = target.dx + (target.dw - dw) / 2;
  const dy = target.dy + (target.dh - dh) / 2;

  ctx.drawImage(img, dx, dy, dw, dh);
}

export async function composeGuideFromSamples(
  structure: StructureData,
  samples: CharacterSample[],
  size: number,
  style: HandwritingStyleAnalysis = DEFAULT_STYLE
) {
  const sources = structure.radicals.map((radical) =>
    findPartSource(radical, samples)
  );

  const availableSources = sources.filter(Boolean) as PartSource[];

  if (availableSources.length === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas取得失敗");
  }

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < structure.radicals.length; i++) {
    const source = sources[i];

    if (!source) continue;

    const img = await loadImage(source.sample.imageUrl);

    const target = getTargetRect(
      structure.layout,
      i,
      structure.radicals.length,
      size,
      style
    );

    drawImageContained(ctx, img, target);
  }

  hardBinarizeCanvas(canvas);

  return canvas.toDataURL("image/png");
}
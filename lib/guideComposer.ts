import type { CharacterSample } from "../types/character";

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
  size: number
) {
  if (layout === "single" || total <= 1) {
    return {
      dx: size * 0.05,
      dy: size * 0.05,
      dw: size * 0.9,
      dh: size * 0.9,
    };
  }

  if (layout === "left-right") {
    const leftWidth = size * 0.43;
    const rightWidth = size * 0.57;

    if (index === 0) {
      return {
        dx: size * 0.02,
        dy: size * 0.05,
        dw: leftWidth,
        dh: size * 0.9,
      };
    }

    return {
      dx: leftWidth - size * 0.02,
      dy: size * 0.03,
      dw: rightWidth,
      dh: size * 0.94,
    };
  }

  if (layout === "top-bottom") {
    if (total === 2) {
      const topHeight = size * 0.42;
      const bottomHeight = size * 0.58;

      if (index === 0) {
        return {
          dx: size * 0.05,
          dy: size * 0.02,
          dw: size * 0.9,
          dh: topHeight,
        };
      }

      return {
        dx: size * 0.05,
        dy: topHeight - size * 0.02,
        dw: size * 0.9,
        dh: bottomHeight,
      };
    }
  }

  if (layout === "surround") {
    if (index === 0) {
      return {
        dx: size * 0.02,
        dy: size * 0.02,
        dw: size * 0.96,
        dh: size * 0.96,
      };
    }

    return {
      dx: size * 0.24,
      dy: size * 0.24,
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
  size: number
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
      size
    );

    drawImageContained(ctx, img, target);
  }

  hardBinarizeCanvas(canvas);

  return canvas.toDataURL("image/png");
}
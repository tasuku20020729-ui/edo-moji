import type { AIBinarizeParams } from "../lib/aiBinarize";

export type KanjiLayout =
  | "single"
  | "left-right"
  | "top-bottom"
  | "surround";

export type HandwritingStyleAnalysis = {
  centerBiasX: number;
  centerBiasY: number;
  compactness: number;
  verticality: number;
  strokeThickness: number;
  leftRightBalance: number;
  topBottomBalance: number;
  characterImpression: string;
  guideInstructions: string[];
};

export type CharacterSample = {
  id: string;
  char: string;
  name: string;
  rawImageUrl: string;
  imageUrl: string;
  skeletonUrl: string;
  createdAt?: string;
  styleAnalysis: HandwritingStyleAnalysis;
  binarizeParams: AIBinarizeParams;
  radicals: string[];
  layout: KanjiLayout;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: {
    x: number;
    y: number;
  };
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  blackRatio: number;
};

export type RadicalPartSample = {
  id: string;
  parentSampleId: string;
  parentChar: string;
  radical: string;
  radicalIndex: number;
  totalRadicals: number;
  layout: KanjiLayout;
  imageUrl: string;
  rawImageUrl: string;
  styleAnalysis: HandwritingStyleAnalysis;
  createdAt?: string;
};
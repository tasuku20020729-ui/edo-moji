export type CharacterSample = {
  id: string;
  char: string;
  name: string;

  // 生画像
  rawImageUrl: string;

  // 前処理済み画像
  imageUrl: string;
  skeletonUrl: string;

  createdAt: string;

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
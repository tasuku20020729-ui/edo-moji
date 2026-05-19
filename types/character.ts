export type CharacterSample = {
  id: string;
  char: string;
  name: string;
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
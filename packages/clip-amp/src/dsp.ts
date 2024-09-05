export enum ClipType {
  BYPASS = 0,
  TANH = 1,
}

export function getClipFn(type: ClipType): (x: number) => number {
  switch (type) {
    case ClipType.TANH:
      return tanh;
    case ClipType.BYPASS:
    default:
      return bypass;
  }
}

const bypass = (x: number) => x;
const tanh = Math.tanh;

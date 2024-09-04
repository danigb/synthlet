export enum ClipType {
  Bypass = 0,
  Tanh = 1,
}

export function getClipFn(type: ClipType): (x: number) => number {
  switch (type) {
    case ClipType.Tanh:
      return tanh;
    case ClipType.Bypass:
    default:
      return bypass;
  }
}

const bypass = (x: number) => x;
const tanh = Math.tanh;

export enum ClipType {
  Tanh = 0,
}

export function getClipFn(type: ClipType): (x: number) => number {
  switch (type) {
    case ClipType.Tanh:
      return tanh;
    default:
      return bypass;
  }
}

const bypass = (x: number) => x;
const tanh = Math.tanh;

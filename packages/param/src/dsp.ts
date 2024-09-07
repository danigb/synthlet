export enum ParamScaleType {
  Bypass = 0,
  DbToGain = 1,
  GainToDb = 2,
  Linear = 3,
}

export type ConvertFn = (input: number, min: number, max: number) => number;

export function getConverter(scale: ParamScaleType): ConvertFn {
  switch (scale) {
    case ParamScaleType.Bypass:
      return bypass;
    case ParamScaleType.DbToGain:
      return dbToGain;
    case ParamScaleType.GainToDb:
      return gainToDb;
    case ParamScaleType.Linear:
      return linear;
    default:
      return bypass;
  }
}

function bypass(input: number) {
  return input;
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function gainToDb(gain: number) {
  return 20 * Math.log10(gain);
}

function linear(input: number, min: number, max: number) {
  return min + input * (max - min);
}

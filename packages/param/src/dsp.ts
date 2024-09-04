export enum ParamType {
  BYPASS = 0,
  DB_TO_GAIN = 1,
  GAIN_TO_DB = 2,
  LINEAR = 2,
}

export type ConvertFn = (input: number, min: number, max: number) => number;

export function getConverter(type: ParamType): ConvertFn {
  switch (type) {
    case ParamType.BYPASS:
      return bypass;
    case ParamType.DB_TO_GAIN:
      return dbToGain;
    case ParamType.GAIN_TO_DB:
      return gainToDb;
    case ParamType.LINEAR:
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

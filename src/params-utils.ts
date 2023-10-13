export type ParamsDef = Record<string, ParamDef>;

export type ParamDef = {
  min: number;
  max: number;
  init: number;
  type?: "k" | "a";
};

export type GenerateParamsMap<T extends ParamsDef> = {
  [K in keyof T]: number[];
};

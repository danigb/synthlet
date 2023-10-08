export type ParamsDef = Record<string, ParamDef>;

export type ParamDef = {
  min: number;
  max: number;
  def: number;
  type?: "k" | "a";
};

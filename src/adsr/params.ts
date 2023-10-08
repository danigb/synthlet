import { ParamsDef } from "../params-utils";

export const AdsrParams: ParamsDef = {
  gate: { min: 0, max: 1, def: 0 },
  attack: { min: 0, max: 10, def: 0.01 },
  decay: { min: 0, max: 10, def: 0.1 },
  sustain: { min: 0, max: 1, def: 0.5 },
  release: { min: 0, max: 10, def: 0.3 },
} as const;

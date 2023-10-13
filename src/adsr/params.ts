import { ParamsDef } from "../params-utils";

export const PARAMS: ParamsDef = {
  gate: { min: 0, max: 1, init: 0 },
  attack: { min: 0, max: 10, init: 0.01 },
  decay: { min: 0, max: 10, init: 0.1 },
  sustain: { min: 0, max: 1, init: 0.5 },
  release: { min: 0, max: 10, init: 0.3 },
} as const;

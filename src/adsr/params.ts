import { ParamsDef } from "../worklet-utils";

export const AdsrParams: ParamsDef = {
  gate: { min: 0, max: 1, defaultValue: 0 },
  attack: { min: 0, max: 10, defaultValue: 0.01 },
  decay: { min: 0, max: 10, defaultValue: 0.1 },
  sustain: { min: 0, max: 1, defaultValue: 0.5 },
  release: { min: 0, max: 10, defaultValue: 0.3 },
} as const;

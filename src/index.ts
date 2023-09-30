import { loadAdsr } from "./adsr/index";
import { loadImpulse } from "./impulse/index";

export * from "./adsr/index";
export * from "./impulse/index";

export function loadSynthlet(context: AudioContext) {
  return Promise.all([loadAdsr(context), loadImpulse(context)]);
}

import { loadAdsr } from "./adsr/index";
import { loadImpulse } from "./impulse/index";
import { loadMika } from "./mika/index";

export * from "./adsr/index";
export * from "./impulse/index";
export * from "./mika/index";

export function loadSynthlet(context: AudioContext) {
  return Promise.all([
    loadAdsr(context),
    loadImpulse(context),
    loadMika(context),
  ]);
}

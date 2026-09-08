// A jest environment with a real Web Audio implementation in the globals.
//
// The rest of the suite runs against `packages/synthlet/src/test-utils.ts`'s
// topology mock, which records connections and never renders a sample. That is
// the right tool for "is this compound wired correctly" and the wrong one for
// "does an `OfflineAudioContext` produce the audio the live path produces" -
// the claim `docs/vision.md` principle 2 makes and `offline.test.ts` tests.
//
// `node-web-audio-api` (the Rust `web-audio-api-rs` binding) implements
// `OfflineAudioContext` and `AudioWorklet` in node, including
// `audioWorklet.addModule` of a `blob:` URL, which is how `createRegistrar`
// registers every processor in this library.
//
// **Why an environment and not an import.** The package is ESM-only, and jest's
// CommonJS runtime cannot load it from inside a test: `await import()` needs
// `--experimental-vm-modules`, and `createRequire` is intercepted by the same
// runtime. A test *environment*, however, is loaded by jest-runner in the real
// node realm through `requireOrImportModule`, which does support ESM - so the
// import happens outside the sandbox and the classes are injected into it.
//
// Opt in per file with a docblock:
//
// ```ts
// /**
//  * @jest-environment ./scripts/offline-audio-env.mjs
//  */
// ```
import NodeEnvironment from "jest-environment-node";
import * as webAudio from "node-web-audio-api";

const Base =
  NodeEnvironment.TestEnvironment ?? NodeEnvironment.default ?? NodeEnvironment;

export default class OfflineAudioEnvironment extends Base {
  async setup() {
    await super.setup();
    for (const [name, value] of Object.entries(webAudio)) {
      // `default` and `__esModule` are module bookkeeping; `mediaDevices` is an
      // input device and there is nothing to plug in.
      if (name === "default" || name === "__esModule") continue;
      if (name === "mediaDevices") continue;
      this.global[name] = value;
    }
  }
}

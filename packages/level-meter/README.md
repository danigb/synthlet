# @synthlet/level-meter

> A pass-through peak meter you can read from the main thread

Part of [Synthlet](https://github.com/danigb/synthlet).

Insert it anywhere in a graph and it passes audio through untouched while
tracking a smoothed peak per channel. The peaks live in a `SharedArrayBuffer`,
so reading them from an animation frame costs nothing — no `postMessage`, no
allocation, no per-frame round trip to the audio thread.

`AnalyserNode` can do this, but it hands you a whole time-domain buffer to
reduce yourself on every frame. This hands you the numbers.

## Install

```bash
npm i @synthlet/level-meter
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerLevelMeterWorklet,
  LevelMeter,
  LevelMeterUI,
} from "@synthlet/level-meter";

const ac = new AudioContext();
await registerLevelMeterWorklet(ac);

const meter = LevelMeter(ac);
source.connect(meter).connect(ac.destination);

const ui = new LevelMeterUI({ minDb: -40, maxDb: 0 });
ui.setCanvas(document.querySelector("canvas"));

function draw() {
  ui.render(meter.getPeaks(), 2); // a live Float32Array, one entry per channel
  requestAnimationFrame(draw);
}
draw();
```

## Configuration

The meter has **no `AudioParam`s** — `LevelMeter.descriptors` is empty. It takes
one construction option:

| Option        | Default | Meaning                      |
| ------------- | ------- | ---------------------------- |
| `maxChannels` | 16      | Sizes the shared peak buffer |

`getPeaks()` returns the same `Float32Array` every call — a live view of the
shared buffer, not a snapshot. Entry `i` is channel `i`'s peak as a linear
magnitude, smoothed by a one-pole at the block rate (`peak × 0.9 + block × 0.1`)
so a meter driven from `requestAnimationFrame` falls at a readable speed. The
processor meters **at most 8 channels** whatever `maxChannels` is set to.

`LevelMeterUI` is an optional canvas renderer: `new LevelMeterUI({ minDb, maxDb })`
(defaults −40 and 0), then `setCanvas(canvas)` and `render(peaks, channels)`
per frame. Only `"horizontal"` orientation is implemented.

**`SharedArrayBuffer` requires a cross-origin-isolated page.** Serve with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, or the constructor throws.

## License

MIT © [danigb](https://github.com/danigb)

# @synthlet/level-meter

> A pass-through peak meter you can read from the main thread

Part of [Synthlet](https://github.com/danigb/synthlet).

Insert it anywhere in a graph and it passes audio through untouched while
tracking a peak, a hold marker and a clip latch per channel. Reading them from
an animation frame is a typed-array read: shared memory where the page allows
it, a posted frame where it does not, and the same numbers either way.

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

**No page requirements.** The readings travel over a `SharedArrayBuffer` when
the page is cross-origin isolated and over `postMessage` when it is not — about
20 floats at 60 Hz either way. The choice is made by feature detection, the
numbers are the same, and `meter.transport` says which is running, for
diagnostics. Nothing needs COOP or COEP headers.

## License

MIT © [danigb](https://github.com/danigb)

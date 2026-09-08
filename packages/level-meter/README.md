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

The meter has **no `AudioParam`s** — `LevelMeter.descriptors` is empty.
Ballistics are properties of the instrument, so they are construction options:

| Option               | Default | Meaning                                        |
| -------------------- | ------- | ---------------------------------------------- |
| `maxChannels`        | 16      | Slots in the level buffer, 1 to 24             |
| `releaseDbPerSecond` | 8.7     | Peak fall rate — K-Meter's 26 dB / 3 s         |
| `holdMs`             | 1500    | How long the hold marker parks at a maximum    |
| `clipHoldMs`         | 1500    | How long the clip latch stays lit              |
| `clipThreshold`      | 1       | Linear magnitude that counts as a clip         |
| `rmsMs`              | 600     | RMS time to 99 % of a step — K-Meter's average |
| `postIntervalMs`     | 16      | Post cadence when the transport is `"message"` |

Attack is instantaneous, release is exponential at `releaseDbPerSecond`, and
both are derived from `sampleRate` — the same signal meters the same at 44.1,
48 and 96 kHz.

`getLevels()` returns the same object every call and allocates nothing, so a
renderer can read it once per animation frame:

```ts
const levels = meter.getLevels();
levels.channelCount; // 2 - from the source, not from you
levels.peak(0); // dBFS, -Infinity for silence
levels.hold(0); // the hold marker
levels.rms(0);
levels.clipped(0); // boolean
levels.clearClip();
levels.snapshot(); // a plain object, when you need to keep one
```

Everything is in dB, because every consumer converted anyway. Silence reads
`-Infinity`, not a floor. `truePeak()`, `momentary` and `shortTerm` read `NaN`
while their measurement is off: "not measured" and "silent" are different
answers.

`getPeaks()` is **deprecated** and still returns what it always did — one linear
peak per slot, the same `Float32Array` every call.

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

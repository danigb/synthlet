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
ui.attach(document.querySelector("canvas"), meter);
```

`attach` takes the animation frame, the `devicePixelRatio` sizing and the
resize handling. `ui.detach()` gives them back. Every meter on the page shares
one `requestAnimationFrame`, so the eighth costs what the first did.

Don't want a canvas? See [Build your own](#build-your-own).

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

### Being told, instead of asking

`getLevels()` is pull. `subscribe` is push, for anything that would otherwise
write its own animation loop:

```ts
const stop = meter.subscribe((levels) => {
  console.log(levels.peak(0), levels.version);
});
stop();
```

At most one call per animation frame, on either transport, and none at all
while nothing is changing. Subscribing starts the loop and the last unsubscribe
stops it — with no subscriber and no attached renderer, nothing is scheduled.

`levels.version` is a number that changes exactly when the readings do, which is
what a framework that diffs by reference needs: the accessor itself is one
reused object, so there is nothing to diff.

## Build your own

The canvas renderer is one UI. These are the numbers, and two ways to draw them
without it. `dbToUnit(db, minDb, maxDb)` is the whole dB-to-pixel conversion —
clamped to `[0, 1]`, and `-Infinity` is 0. `formatDb(db, digits?)` is the label,
with a real minus sign: `formatDb(-Infinity)` is `"−∞"`.

### 1. A DOM meter, in twenty lines

```js
import { LevelMeter, dbToUnit, formatDb } from "@synthlet/level-meter";

const meter = LevelMeter(ac);
source.connect(meter).connect(ac.destination);

const container = document.querySelector("#meter");
const bars = [];

function addBar(c) {
  const row = document.createElement("div");
  const peak = document.createElement("i");
  const hold = document.createElement("b");
  row.className = "bar";
  row.append(peak, hold);
  container.append(row);
  return (bars[c] = { row, peak, hold });
}

const stop = meter.subscribe((levels) => {
  for (let c = 0; c < levels.channelCount; c++) {
    const { row, peak, hold } = bars[c] ?? addBar(c);
    peak.style.width = dbToUnit(levels.peak(c), -60, 0) * 100 + "%";
    hold.style.left = dbToUnit(levels.hold(c), -60, 0) * 100 + "%";
    row.classList.toggle("clip", levels.clipped(c));
    row.title = formatDb(levels.peak(c), 1);
  }
});
```

```css
.bar {
  position: relative;
  height: 12px;
  background: #111;
  margin: 2px 0;
}
.bar i {
  display: block;
  height: 100%;
  background: #3cb43c;
}
.bar b {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: #eee;
}
.bar.clip {
  outline: 2px solid #a01000;
}
```

### 2. A React hook, in ten

```tsx
import { useSyncExternalStore } from "react";
import { dbToUnit, type LevelMeterWorkletNode } from "@synthlet/level-meter";

export function useLevels(meter: LevelMeterWorkletNode) {
  // `version` is the snapshot: a number that changes exactly when the readings
  // do. The accessor is one reused object, so React could not diff it — but it
  // is also allocation-free, which is why it is what gets returned.
  useSyncExternalStore(
    meter.subscribe, // stable for the life of the node, so no useCallback
    () => meter.getLevels().version,
    () => 0, // server render: no meter, no readings
  );
  return meter.getLevels();
}
```

```tsx
function Meter({ meter }: { meter: LevelMeterWorkletNode }) {
  const levels = useLevels(meter);
  return (
    <div className="meter">
      {Array.from({ length: levels.channelCount }, (_, c) => (
        <div key={c} className={levels.clipped(c) ? "bar clip" : "bar"}>
          <i style={{ width: `${dbToUnit(levels.peak(c), -60, 0) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}
```

There is no `@synthlet/react`: a package would need a peer dependency, a release
cadence and an opinion about every framework that is not React. Ten lines carry
none of that.

### 3. The canvas one, for contrast

```ts
import { LevelMeterUI } from "@synthlet/level-meter";

new LevelMeterUI({ orientation: "vertical" }).attach(canvas, meter);
```

`LevelMeterUI` draws the peak bar, the RMS bar inset within it, the hold marker,
a latching clip indicator and a dB scale. Options: `minDb` and `maxDb` (−40 and
0; any range with `minDb < maxDb` works), `orientation` (`"horizontal"` or
`"vertical"`), `scale`, `scaleDb`, `clip`, `hold`, `rms`, `stripes`, `gap` and
`colors`. `setCanvas(canvas)` plus `render(levels)` is the manual path, for
callers who already own a loop — in that mode the canvas's pixel size is yours
to set.

**No page requirements.** The readings travel over a `SharedArrayBuffer` when
the page is cross-origin isolated and over `postMessage` when it is not — about
20 floats at 60 Hz either way. The choice is made by feature detection, the
numbers are the same, and `meter.transport` says which is running, for
diagnostics. Nothing needs COOP or COEP headers.

## License

MIT © [danigb](https://github.com/danigb)

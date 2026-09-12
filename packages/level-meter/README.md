# @synthlet/level-meter

> Peak, RMS, true peak and loudness, from any node in any Web Audio graph

Part of [Synthlet](https://github.com/danigb/synthlet).

```ts
import { LevelMeter } from "@synthlet/level-meter";

const meter = LevelMeter.tap(source);
meter.getLevels().peak(0); // dBFS, -Infinity for silence
```

That is the whole thing. No context argument — it comes from `source`. No
registration call to forget. No `await`: `tap` returns synchronously and reads
silence until it is measuring, which cannot be observed by the audio graph
because a tap has no output for anything to notice.

It measures every channel separately, sees every sample, and runs offline over a
rendered buffer as readily as it runs live.

## Why not `AnalyserNode`

Two correctness reasons, before any convenience one.

**1. `AnalyserNode` down-mixes to mono before it analyses.** A stereo bus with a
hot right channel reads as neither channel — it reads as the average. Per-channel
metering with `AnalyserNode` means a `ChannelSplitter` and one analyser per
channel, kept in step by hand. This meter measures each channel on its own and
tells you how many the source actually carries.

**2. `AnalyserNode` shows you the last `fftSize` samples at the moment you ask.**
Never the ones before them. At 48 kHz and 60 fps there are 800 new samples
between reads, so any window smaller than that leaves gaps even when nothing goes
wrong — and a dropped frame, a 30 fps loop or a backgrounded tab leaves them
whatever the window size. A worklet sees every sample, which is the entire point
of a peak meter: the bar you read is built from all 800, not from the ones that
happened to still be in a buffer.

The convenience argument is real too: `AnalyserNode` hands you a whole
time-domain buffer to reduce yourself, on every frame, in JavaScript. This hands
you the numbers.

**Not `@synthlet/envelope-follower`, and neither replaces the other.** This
posts numbers to the main thread for a UI to draw; the follower produces a
control signal at audio rate for an `AudioParam` inside the graph. The names are
close enough to confuse; the difference is which side of the fence the number
comes out on.

## Install

```bash
npm i @synthlet/level-meter
```

Or `npm i synthlet` for every module at once.

## Quick start

Attach it, and draw it:

```ts
import { LevelMeter, LevelMeterUI } from "@synthlet/level-meter";

const meter = LevelMeter.tap(source);

const ui = new LevelMeterUI({ minDb: -40, maxDb: 0 });
ui.attach(canvas, meter);
```

`attach` takes the animation frame, the `devicePixelRatio` sizing and the resize
handling. `ui.detach()` gives them back. Every meter on the page shares one
`requestAnimationFrame`, so the eighth costs what the first did.

Don't want a canvas? See [Build your own](#build-your-own).

`await meter.ready` if you need to know when it started — it resolves once the
worklet is registered, the node built and the edge connected, and rejects only
when nothing can run at all.

## Tap, or pass-through

Two forms, and **`tap` is the one to reach for**.

```ts
const meter = LevelMeter.tap(source); // adds an edge; changes nothing else
meter.dispose(); // removes it
```

A tap is a second _outgoing_ edge. It is additive and reversible: whatever
`source` was already connected to stays connected, you do not need to know what
that was, and there is nothing downstream of the meter for a thrown processor to
silence. `source` can be a `Compound` — it is its own output node, so tapping one
needs no reference to which node it ends in. Pass `{ output: 1 }` for a node with
more than one output.

```ts
const meter = LevelMeter(ac); // pass-through: audio in, same audio out
source.connect(meter).connect(ac.destination);
```

Pass-through goes _in_ the path, so metering a connection means breaking it —
`source.disconnect(dest)`, reconnect through the meter, and put it back on
`dispose()`, which nothing helps you with. Reach for it only when you actually
want the meter in the signal path.

It is a **native `GainNode` with a tap beside it**, so the audio never waits for
the worklet to register and there is no JavaScript in the signal path at all. The
processor has `numberOfOutputs: 0` in both forms. `LevelMeterWorkletNode` is kept
as a deprecated alias of `LevelMeterNode` for one release.

`registerLevelMeterWorklet(ac)` is still exported, for callers who would rather
front-load registration; both forms go through it, so a context registers once
however many meters it carries.

**Both forms report a dead processor.** If the processor throws, the browser
stops calling it permanently and the readings freeze. `getLevels().error` says
so, and an `onError` option is called with the event:

```ts
LevelMeter.tap(source, {
  onError: (event) => console.warn("meter died", event),
});
```

**On browser support.** A tap has `numberOfOutputs: 0` and nothing downstream, so
whether it keeps being rendered is a browser behaviour rather than a guarantee.
Measured in Chrome 152 on macOS, headless and headful: a zero-output node is
called at the full block rate — 652 of an expected 652 blocks over 2 s — whether
or not its source reaches the destination, and it sees the real signal.
**Firefox and Safari are unverified.** If a browser turns out to prune such a
node, the fallback is a zero-gain sink between the meter and the destination, and
pass-through works everywhere today.

## What it measures

Four readings per channel, always on, in dB, with silence reading exactly
`-Infinity` rather than a floor:

| Reading      | What it is          | Ballistics                                     |
| ------------ | ------------------- | ---------------------------------------------- |
| `peak(c)`    | the bar             | instant attack, 8.7 dB/s release               |
| `hold(c)`    | the marker above it | running maximum, parked 1500 ms, then 8.7 dB/s |
| `rms(c)`     | average power       | one-pole, 600 ms to 99 % of a step             |
| `clipped(c)` | the light           | latches at 0 dBFS, held 1500 ms, `clearClip()` |

The numbers are
[K-Meter's](https://github.com/mzuther/K-Meter/blob/master/Source/meter_ballistics.cpp),
an open-source implementation of Bob Katz's published K-System spec, and the only
sourced set found for a digital peak meter. **Attack is instantaneous** — a peak
meter that smooths the attack is not measuring peak — and release is exponential.
Both are derived from `sampleRate`, so the same signal meters the same at 44.1,
48 and 96 kHz.

Every one of them is a construction option rather than an `AudioParam`:
`LevelMeter.descriptors` is empty, because ballistics are properties of the
instrument, not something anyone modulates.

| Option               | Default | Meaning                                        |
| -------------------- | ------- | ---------------------------------------------- |
| `maxChannels`        | 16      | Slots in the level buffer, 1 to 24             |
| `releaseDbPerSecond` | 8.7     | Peak fall rate — K-Meter's 26 dB / 3 s         |
| `holdMs`             | 1500    | How long the hold marker parks at a maximum    |
| `clipHoldMs`         | 1500    | How long the clip latch stays lit              |
| `clipThreshold`      | 1       | Linear magnitude that counts as a clip         |
| `rmsMs`              | 600     | RMS time to 99 % of a step — K-Meter's average |
| `truePeak`           | `false` | Measure true peak — see below                  |
| `loudness`           | `false` | Measure BS.1770-5 loudness — see below         |
| `channelWeights`     | all 1.0 | Per-channel `G_i`, for a surround bus          |
| `postIntervalMs`     | 16      | Post cadence when the transport is `"message"` |
| `onError`            | —       | Called if the processor throws                 |

### Reading them

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

Everything is in dB, because every consumer converted anyway. `truePeak()`,
`momentary` and `shortTerm` read `NaN` while their measurement is off: **"not
measured" and "silent" are different answers**, and `-Infinity` would say the
second when the truth is the first.

`getPeaks()` is **deprecated** — use `getLevels()`, which knows the channel
count; it still returns one linear peak per slot, the same `Float32Array` every
call.

### Being told, instead of asking

`getLevels()` is pull. `subscribe` is push, for anything that would otherwise
write its own animation loop:

```ts
const stop = meter.subscribe((levels) => {
  console.log(levels.peak(0), levels.version);
});
stop();
```

At most one call per animation frame, on either transport, and none at all while
nothing is changing. Subscribing starts the loop and the last unsubscribe stops
it — with no subscriber and no attached renderer, nothing is scheduled.

`levels.version` is a number that changes exactly when the readings do, which is
what a framework that diffs by reference needs: the accessor itself is one reused
object, so there is nothing to diff.

## Opt in: true peak and loudness

Two more measurements, off by default, for opposite reasons.

```ts
const meter = LevelMeter.tap(master, { truePeak: true, loudness: true });

meter.getLevels().truePeak(0); // dBTP
meter.getLevels().momentary; // LUFS over the last 400 ms
meter.getLevels().shortTerm; // LUFS over the last 3 s
```

### True peak

Sampling hides up to about 3 dB. A quarter-Nyquist sine sampled at its zero
crossings has every sample at ±0.707 while the reconstructed waveform reaches
1.0, so a track that never exceeds 0 dBFS on a sample meter can still clip a
converter or a lossy encoder. That is why delivery specs are written in dBTP.

The detector is the
[lookahead limiter's](https://github.com/danigb/synthlet/tree/main/packages/lookahead-limiter)
— one implementation, so the two packages agree about dBTP by construction rather
than by inspection. `TRUE_PEAK_CEILING_DBTP` is exported, so a renderer drawing
the −1 dBTP line does not have to hardcode it.

**It is the expensive one**, at 48 multiply-accumulates per sample per channel.
Measured as CPU time over five minutes of 48 kHz stereo, best of twelve runs:

| Measuring             | CPU per 5 min | Realtime factor |
| --------------------- | ------------- | --------------- |
| peak, hold, clip, RMS | 74 ms         | ~4100×          |
| ... plus loudness     | 181 ms        | ~1700×          |
| ... plus true peak    | 3.3 s         | ~91×            |

True peak costs more than everything else in the meter put together by better
than an order of magnitude, which is why it is asked for rather than assumed.
Loudness is cheap; it is opt-in only because a number nobody reads is still
waste.

### Loudness

Peak asks how much headroom is left. Loudness asks how loud it sounds, and it is
the quantity every delivery spec is written in. `loudness: true` measures it to
[ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770/en), in the EBU R 128
shape.

Momentary (400 ms) and Short-term (3 s) are ungated sliding windows, so they are
readings like any other — no history, no session. **Integrated** loudness is not:
it is defined over a programme, and a synth that has been running since page load
has none. So the caller declares one:

```ts
meter.startIntegration(); // the programme starts here
meter.integrated; // LUFS since then; -Infinity until there is something
meter.stopIntegration(); // pause; the reading stands
meter.resetIntegration(); // discard it
```

`channelWeights` is BS.1770-5 Annex 1 Table 3's `G_i`, and it defaults to 1.0
everywhere. Nothing here infers a surround layout from a channel count: Web Audio
does not say what channel 4 is, and guessing wrong moves the reading by 1.5 dB in
silence. For a 5.1 bus, say so:

```ts
import { BS1770_51_CHANNEL_WEIGHTS } from "@synthlet/level-meter/dsp";

const meter = LevelMeter.tap(bus, {
  loudness: true,
  channelWeights: BS1770_51_CHANNEL_WEIGHTS,
});
```

The whole of BS.1770-5 is on `@synthlet/level-meter/dsp` if you want it directly:
`kWeightingCoefficients(sampleRate)` derives both biquads at any rate rather than
looking up the published 48 kHz table, and `createLoudnessAnalyzer` is the core
the meter drives. It is validated against the EBU Tech 3341 and Tech 3342
conformance signals — the standards' own numbered test cases, synthesised and run
as ordinary tests.

## Offline analysis

Half of what a metering package is for is answering "what is the LUFS of this
file", and that needs no context, no worklet and no browser:

```ts
import { analyze } from "@synthlet/level-meter/dsp";

const analysis = await analyze(channels, sampleRate, {
  truePeak: true,
  loudness: true,
});

analysis.peak; // dBFS per channel, the highest anywhere in the buffer
analysis.truePeak; // dBTP per channel
analysis.rms; // dBFS per channel, where the buffer ends
analysis.clipped; // boolean per channel
analysis.integrated; // LUFS over the whole buffer
analysis.lra; // LU
analysis.duration; // seconds
```

It takes `Float32Array[]` and a number rather than an `AudioBuffer`, so it runs
in node, in jest and in a worker. When a buffer is what you have,
`analyzeAudioBuffer` is the adapter:

```ts
import { analyzeAudioBuffer } from "@synthlet/level-meter/dsp";

const analysis = await analyzeAudioBuffer(buffer, { loudness: true });
```

**It is chunked and yields between chunks**, so five minutes of true-peak
analysis does not freeze the tab, and `onProgress` reports a fraction after each
one:

```ts
await analyze(channels, sampleRate, {
  truePeak: true,
  onProgress: (fraction) => (bar.value = fraction),
});
```

**Offline and realtime are the same code**, not two implementations that agree.
The ballistics run on a fixed 128-sample frame either way, and over the same
samples the two leave the readings buffer in byte-identical states — asserted in
the test suite rather than hoped for.

Two numbers exist only here. **Integrated** is offline's by right: an `analyze`
call has the programme boundary a live meter has to be given. **Loudness Range**
is offline's by nature — EBU Tech 3342 describes a whole programme, as the 95th
percentile of the short-term distribution minus the 10th after a −20 LU relative
gate, and asks a meter to warn that the value is not stable for the first 60 s.
As a live readout it is close to meaningless, so there is no realtime slot for
it.

### Hitting a target

```ts
import { gainToTarget } from "@synthlet/level-meter/dsp";

gainToTarget(-23, -14); // 9 - dB to apply
```

`gainToTarget` returns dB and leaves applying it to you on purpose: a gain that
hits a loudness target can push the true peak through the ceiling, and deciding
what to do about that — limit, or turn down — is a different job. The
[lookahead limiter](https://github.com/danigb/synthlet/tree/main/packages/lookahead-limiter)
is what that job looks like.

### Delivery targets

What the number is usually being checked against. Broadcast figures are normative
and cited; the streaming ones are platform policy, they drift, and the platform's
own page is the only current source.

| Target                | Programme loudness | True-peak ceiling | Source                                                  |
| --------------------- | ------------------ | ----------------- | ------------------------------------------------------- |
| EBU R 128 (broadcast) | −23.0 LUFS         | −1 dBTP           | [EBU R 128](https://tech.ebu.ch/docs/r/r128.pdf) §h, §m |
| ATSC A/85 (US TV)     | −24 LKFS           | —                 | ATSC A/85, via ITU-R BS.1770-5                          |
| Streaming             | ≈ −14 LUFS         | −1 dBTP           | Each platform's own documentation                       |

Checked 2026-09-08. `−23.0 LUFS` and `−1 dBTP` are quoted from EBU R 128 (2023),
recommendations h and m. The streaming row is an approximation and is **not**
verified against any platform's documentation here — individual services differ
from it, and change. **Do not hardcode any of these**: read the target from the
platform you are delivering to, and pass it to `gainToTarget`.

## Build your own

The canvas renderer is one UI. These are the numbers, and two ways to draw them
without it. `dbToUnit(db, minDb, maxDb)` is the whole dB-to-pixel conversion —
clamped to `[0, 1]`, and `-Infinity` is 0. `formatDb(db, digits?)` is the label,
with a real minus sign: `formatDb(-Infinity)` is `"−∞"`.

### 1. A DOM meter, in twenty lines

```js
import { LevelMeter, dbToUnit, formatDb } from "@synthlet/level-meter";

const meter = LevelMeter.tap(source);

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
import { dbToUnit, type LevelMeterTap } from "@synthlet/level-meter";

export function useLevels(meter: LevelMeterTap) {
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
function Meter({ meter }: { meter: LevelMeterTap }) {
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
callers who already own a loop — in that mode the canvas's pixel size is yours to
set.

## Transport

**No page requirements.** The readings travel over a `SharedArrayBuffer` when the
page is cross-origin isolated and over `postMessage` when it is not — about 20
floats at 60 Hz either way. The choice is made by feature detection, the numbers
are identical, and `meter.transport` says which is running, for diagnostics.
Nothing needs COOP or COEP headers, which is why this package's own
[documentation site](https://danigb.github.io/synthlet/docs/level-meter) — a
static export on GitHub Pages — shows a live meter.

## Works on http

`AudioWorklet` is `[SecureContext]` in the Web Audio IDL. On a page that is not
a secure context `ac.audioWorklet` is not a rejected promise or a feature flag —
it is **`undefined`**. That is a phone on the LAN at `http://192.168.1.20:3000`,
an intranet tool, a kiosk, an https page inside an http iframe. `localhost` and
`127.0.0.1` _are_ secure contexts, which is exactly why it works on every
developer's machine and fails on the first device that is not one.

So the meter carries a second engine and picks one for you:

```ts
const meter = LevelMeter.tap(source); // same call on http and https
meter.engine; // "worklet" | "script-processor"
```

`"script-processor"` is a `ScriptProcessorNode` driving **the same core** the
worklet runs — the one `@synthlet/level-meter/dsp` exports — so the readings are
the same numbers, not an approximation of them. A jest test feeds both engines
the same blocks at every allowed buffer size, with true peak and loudness on and
off, and asserts the resulting level buffers are equal.

It is chosen when there is no `audioWorklet` at all, and when registration
_rejects_ — a CSP that blocks `blob:` scripts is the common one. Force it with
`{ engine: "script-processor" }`, which is how the fallback stays testable from
an https page.

**`AnalyserNode` is not the fallback**, because it would change what the number
means: it down-mixes to mono and reports only the last N samples at the moment
you ask. A meter that quietly reports a different quantity on http than on https
is worse than one that throws.

**What it costs.** `onaudioprocess` runs on the main thread, which is a late
_reading_ for a tap and would be a dropout in the signal path — so this is a tap
driver, and pass-through being a native `GainNode` is what lets both modes use
it. The audio never touches JavaScript on the main thread; only the reading
does. Measured in Chrome 152 on macOS (Apple Silicon), 48 kHz, stereo, per
1024-frame buffer — 21.3 ms of audio:

|                       | µs per buffer | of realtime |
| --------------------- | ------------- | ----------- |
| peak, hold, RMS, clip | **7.5**       | 0.035 %     |
| + `loudness`          | 18.3          | 0.086 %     |
| + `truePeak`          | 261.7         | 1.23 %      |
| both                  | 271.7         | 1.27 %      |

True peak is the one to think about before switching it on, exactly as it is on
the worklet — it is the same core doing the same 48 multiply-accumulates per
sample per channel.

**Two things differ from the worklet, and neither is a reading.** `bufferSize`
(default 1024, one of 256 … 16384) sets how often the reading updates — 21 ms at
48 kHz, a frame and a half at 60 fps, invisible against a 1.5 s hold. And a
`ScriptProcessorNode`'s input channel count is **fixed when it is built**, so
this engine cannot follow a source that changes its own; it uses the source's
`channelCount` and `inputChannels` overrides it. A mono source whose
`channelCount` is the default 2 therefore meters as two identical channels here
and as one on the worklet.

**Verified in headless Chrome 152 with the engine forced on an https page**: it
meters, `engine` reads `"script-processor"`, and it agrees with a worklet meter
on the same oscillator to 0.02 dB. **Not verified**: a real plain-http page from
a real phone, and Firefox, Safari and iOS Safari — none of which could be
reached from where this was written.

## License

MIT © [danigb](https://github.com/danigb)

# The tutorial voice

`learnVoice` is the one synth the Learning Synthlet section shares: a
`VoiceDefinition` for `Instrument`, thirty-one parameters, two preset banks.
It mirrors the engine behind Ableton's _Learning Synths_ so a lesson maps onto
it one for one, and it is a superset of the library's own `monoVoice` — a
second oscillator, noise, pulse-width modulation, a modulation envelope, a
filter LFO, tremolo, a pitch envelope and keyboard tracking.

It is **site-only** on purpose. The library's first named synth should be
chosen because it sounds great; this one is chosen because it _teaches_, and
where the two want different defaults, teaching wins here. Promotion is one
move, because a `VoiceDefinition` is already the published shape.

> **The promotion criterion**: if a recipe preset sounds good enough to be a
> factory sound, the voice goes to the library with it.

## Files

| File                  | What                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `params.ts`           | The thirty-one `ParamSpec`s, the groups, the `select` option lists |
| `learn-voice.ts`      | The compound and the definition — the patch itself                 |
| `register.ts`         | The six worklets the voice builds, and no others                   |
| `presets.ts`          | The lesson bank and the gallery bank                               |
| `learn-voice.test.ts` | The schema checks and an `OfflineAudioContext` render              |
| `index.ts`            | The barrel: `import { learnVoice } from "@/learn/voice"`           |

```ts
import { Instrument } from "synthlet";
import { learnVoice } from "@/learn/voice";

const synth = Instrument(ac, learnVoice, { voices: 8, preset: "strings" });
synth.connect(ac.destination);
await synth.ready;
synth.start({ note: "C4", velocity: 96, duration: 0.5 });
```

## The patch

```
                   gate ─┬─ AdsrEnv (mod*)  ──┐  the modulation envelope
                         ├─ Lfo (lfo*)      ──┤  one LFO, four destinations
                         └─ AdsrAmp (a d s r) │
                                              │
 frequency ─┬─ PolyblepOscillator (waveform) ─┼─ sawLevel   ─┐
            ├─ PolyblepOscillator (Square)   ─┼─ pulseLevel ─┤
            │        ▲ width, detune          │              │
            │  Noise (White) ─────────────────┼─ noiseLevel ─┤
            │                                 │              │
            └─ keyTrack ──────────────────────┴──► Svf ◄─────┘
                                                    │
                                      AdsrAmp ──► Gain (tremolo on its gain)
```

Every modulation amount is a `GainNode` in the control path whose own `gain` is
the knob — Part 9's "an envelope amount is a VCA" — so there is exactly one kind
of routing in the file and every `connect()` is a line you can follow with a
finger.

## The parameter table

`label` is what a control shows, `scale` how its slider moves. Both are
_derived_ — the rule is below the table — so nothing here has to be retyped in
the patch.

### Oscillators

| Param           | Label         | Range      | Unit      | Scale  | Default | What it does                                |
| --------------- | ------------- | ---------- | --------- | ------ | ------- | ------------------------------------------- |
| `sawLevel`      | Saw level     | 0 – 1      | —         | linear | 1       | The first oscillator in the mix             |
| `pulseLevel`    | Pulse level   | 0 – 1      | —         | linear | 0       | The second oscillator in the mix            |
| `pulseWidth`    | Pulse width   | 0 – 1      | —         | linear | 0.5     | 0.5 is a square; either end is a thin spike |
| `pulseWidthLfo` | PWM depth     | 0 – 0.5    | —         | linear | 0       | How far the LFO swings the width            |
| `pulseWidthEnv` | PW envelope   | −0.5 – 0.5 | —         | linear | 0       | How far the modulation envelope moves it    |
| `noiseLevel`    | Noise level   | 0 – 1      | —         | linear | 0       | White noise in the mix                      |
| `detuneCoarse`  | Coarse detune | −12 – 12   | semitones | linear | 0       | The pulse's offset: −12 is a sub, 7 a fifth |
| `detuneFine`    | Fine detune   | −50 – 50   | cents     | linear | 0       | The pulse a few cents off, which is "fat"   |
| `waveform`      | Waveform      | 0 – 3      | index     | select | 2       | The first oscillator's shape                |

### Pitch

| Param      | Label          | Range        | Unit      | Scale  | Default | What it does                                              |
| ---------- | -------------- | ------------ | --------- | ------ | ------- | --------------------------------------------------------- |
| `pitchEnv` | Pitch envelope | −12 – 12     | semitones | linear | 0       | The modulation envelope on both oscillators               |
| `pitchLfo` | Pitch LFO      | 0 – 12       | semitones | linear | 0       | Vibrato depth; small values are vibrato, large are sirens |
| `bend`     | Bend           | −1200 – 1200 | cents     | linear | 0       | The whole voice's pitch offset, and the bend wheel        |

### Filter

| Param        | Label           | Range          | Unit  | Scale  | Default | What it does                                            |
| ------------ | --------------- | -------------- | ----- | ------ | ------- | ------------------------------------------------------- |
| `cutoff`     | Cutoff          | 20 – 12000     | Hz    | log    | 12000   | Where the filter sits with nothing modulating it        |
| `resonance`  | Resonance       | 0.5 – 12       | Q     | linear | 0.7071  | The peak at the cutoff; 0.7071 is no resonance at all   |
| `filterEnv`  | Filter envelope | −10000 – 10000 | Hz    | linear | 0       | How far the modulation envelope opens it — or closes it |
| `filterLfo`  | Filter LFO      | 0 – 5000       | Hz    | linear | 0       | The wah, the growl and the siren, by rate               |
| `keyTrack`   | Key tracking    | 0 – 1          | —     | linear | 0       | How much the note's own pitch carries the cutoff        |
| `filterType` | Filter type     | 0 – 4          | index | select | 1       | Lowpass, highpass, bandpass, notch                      |

### Envelopes

| Param        | Label              | Range  | Unit | Scale  | Default | What it does                                         |
| ------------ | ------------------ | ------ | ---- | ------ | ------- | ---------------------------------------------------- |
| `attack`     | Attack             | 0 – 10 | s    | time   | 0.01    | The amplifier's ADSR: what you hear                  |
| `decay`      | Decay              | 0 – 10 | s    | time   | 0.1     |                                                      |
| `sustain`    | Sustain            | 0 – 1  | —    | linear | 0.5     |                                                      |
| `release`    | Release            | 0 – 10 | s    | time   | 0.3     |                                                      |
| `modAttack`  | Modulation attack  | 0 – 10 | s    | time   | 0.01    | The second ADSR, which has no destination of its own |
| `modDecay`   | Modulation decay   | 0 – 10 | s    | time   | 0.1     |                                                      |
| `modSustain` | Modulation sustain | 0 – 1  | —    | linear | 0.5     |                                                      |
| `modRelease` | Modulation release | 0 – 10 | s    | time   | 0.3     |                                                      |

### LFO

| Param        | Label             | Range     | Unit  | Scale  | Default | What it does                                            |
| ------------ | ----------------- | --------- | ----- | ------ | ------- | ------------------------------------------------------- |
| `lfoShape`   | LFO shape         | 0 – 12    | index | select | 1       | Sine through to random and drift                        |
| `lfoRate`    | LFO rate          | 0.02 – 40 | Hz    | log    | 5       | A slow tide, a wah, a growl                             |
| `lfoDelay`   | LFO delay         | 0 – 5     | s     | time   | 0       | The fade-in the note's own gate restarts. 0 disables it |
| `tremolo`    | Tremolo           | 0 – 1     | —     | linear | 0       | The LFO on the voice's output level                     |
| `lfoRateEnv` | LFO rate envelope | −20 – 20  | Hz    | linear | 0       | The modulation envelope on the LFO's own rate           |

**Every default is a plain saw through an open filter**, which is why `Init` is
`{}`: one sawtooth at full level, no second oscillator, no noise, no modulation
anywhere, the filter at the top of its range and the modules' own envelopes.

## The derivation contract for `patches/voice.ts`

This is ticket 03 ("The kit")'s to build; the contract is here so that the
patch derives its controls from `learnVoice.params` rather than restating them.

### One control per parameter

```
for each [name, spec] of Object.entries(learnVoice.params):
  kind  = spec.unit === "index" ? "select" : "slider"
  label = LABEL[name]                       (below)
  min, max, default = spec.min, spec.max, spec.default
  unit  = spec.unit                         (undefined means a bare number)
  scale = spec.unit === "index"              ? —
        : spec.min > 0 && spec.max / spec.min >= 100 ? "log"
        : spec.unit === "s"                  ? "time"
        : "linear"
  options = INDEX_OPTIONS[name]              (selects only)
```

- **`log`** — the slider's position is `log(value)` between `log(min)` and
  `log(max)`. Two parameters take it: `cutoff` and `lfoRate`, both of which span
  more than two decades and are unusable linear.
- **`time`** — a squared taper, `min + position² × (max − min)`, because a
  linear second is a slider whose first third is the whole of a plucked note and
  whose last third is unusable. `log` cannot be used: every time here starts at
  0, which has no logarithm.
- **`linear`** — everything else, including `resonance` (0.5 – 12 is not two
  decades) and the Hz _amounts_ (`filterEnv`, `filterLfo`, `lfoRateEnv`), which
  are depths rather than frequencies and read linearly.
- **`select`** — `INDEX_OPTIONS[name][value - spec.min]` is the label; the value
  written to the `AudioParam` is the index. This is the library's user-zone rule
  met where a `ParamSpec` can meet it: a string at the surface, a number in the
  DSP.

### The option lists, in index order

| Param        | Options                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waveform`   | `sine`, `triangle`, `sawtooth`, `square`                                                                                                                    |
| `filterType` | `bypass`, `lowpass`, `bandpass`, `highpass`, `notch`                                                                                                        |
| `lfoShape`   | `none`, `sine`, `triangle`, `ramp up`, `ramp down`, `square`, `exp ramp up`, `exp ramp down`, `exp triangle`, `random`, `impulse`, `smooth random`, `drift` |

All three are exported from `params.ts` as `WAVEFORM_NAMES`,
`FILTER_TYPE_NAMES` and `LFO_SHAPE_NAMES`, with `INDEX_OPTIONS` mapping a
parameter name to its list.

### Labels

The mechanical rule is _split the camelCase key, sentence-case it_, with three
expansions — `Env` → `envelope`, `Lfo` → `LFO`, `mod` → `modulation` — and four
whole-key exceptions where the mechanical name is wrong:

| Key             | Label         | Why                                           |
| --------------- | ------------- | --------------------------------------------- |
| `pulseWidthLfo` | PWM depth     | The name everyone uses                        |
| `pulseWidthEnv` | PW envelope   | "Pulse width envelope" does not fit a control |
| `detuneCoarse`  | Coarse detune | English word order                            |
| `detuneFine`    | Fine detune   | English word order                            |
| `keyTrack`      | Key tracking  |                                               |

The table above is the result for all thirty-one; it is the source of truth if
the rule and the table ever disagree.

### Groups

`LEARN_VOICE_GROUPS` maps `oscillators`, `pitch`, `filter`, `envelopes`, `lfo`
to their parameter names, in the order the Playground should lay them out. The
five groups partition the thirty-one exactly once, and `learn-voice.test.ts`
keeps them doing so.

### The two controls that are not parameters

| Control  | Kind                   | Range   | Default | Backed by                                                                                                                          |
| -------- | ---------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `glide`  | slider, `time` scale   | 0 – 1 s | 0       | `synth.glide`, a plain number property                                                                                             |
| `voices` | slider, linear, step 1 | 1 – 8   | 8       | Rebuilds the instrument — the pool is fixed, so a different size is a different instrument (`site/examples/InstrumentExample.tsx`) |

**`glide` is an instrument option, not a parameter.** The allocator applies it,
so it has no fan-out node and no `AudioParam`; a preset may carry it (several
in the gallery do) and it is live-settable. The patch adds it by hand, the way
`InstrumentExample.tsx` does, with a two-line accessor view.

**`keyboard` is a view, not a control.** The patch declares
`views: ["keyboard", "meter", "scope", "spectrum"]`; the keyboard calls
`synth.start({ note, velocity })` and the returned `StopFn` on release. It is
listed here only because the ticket's checklist names it alongside `glide`.

## The presets

Two banks in `presets.ts`: `lessonPresets` and `galleryPresets`, exported
separately as `presetBanks = { lesson, gallery }` and flat-merged as `presets`,
which is what the definition carries — `Instrument.setPreset` has one namespace.
The banks are disjoint and the test keeps them so.

A preset is **complete, not a diff**: `resolvePreset` writes every declared
parameter on every load, the ones it does not name at their defaults. Nothing
inherits anything from the sound before it.

### The lesson bank

Each is as close to `Init` as its lesson allows: a preset that set nine
parameters where the page shows two sliders would be teaching by accident.

| Preset                                                                       | For                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Init`                                                                       | `{}`. Lesson 0.1, "play a synth", and the Playground's starting point                                                                                  |
| `attack` `decay-sustain` `release`                                           | Lessons 2.1 – 2.3, one envelope stage each                                                                                                             |
| `envelope-organ` `envelope-trombone` `envelope-thunderclap` `envelope-flute` | Lesson 2.4's four targets, from Part 3's Figure 5 and Part 54's flute. **Amp ADSR only**, because the reader matches them with four sliders            |
| `filter-sweep` `filter-types` `key-tracking`                                 | Chapter 4                                                                                                                                              |
| `pwm` `vibrato` `tremolo` `pitch-envelope`                                   | Chapter 5: one destination each, so "the same wobble is three sounds" is audible                                                                       |
| `siren-german` `siren-american`                                              | Ableton's two sirens: the same filter LFO amount through a square (two tones, alternating) and through a triangle at half the rate (one tone, wailing) |
| `noise` `detune`                                                             | Chapters 1 and 6                                                                                                                                       |

### The gallery bank

Sixteen, the Playground's tiles: `bass`, `wow-bass`, `sub`, `lead`, `pluck`,
`strings`, `brass`, `flute`, `kick`, `hat`, `siren`, `laser`, `bouncing-ball`,
`old-computer`, `grit`, `two-sounds-in-one`.

`brass`, `flute` and `strings` are the recipes chapter's three
(ticket 13, "Chapter 8: Recipes"),
written from the book's numbers — Parts 25–27, 52–54 and 46–47 — and **not yet
tuned by ear**. That is ticket 13's job, and it is the ticket that decides
whether any of them meets the promotion criterion at the top of this file.

## Limits worth knowing

Three, all of them consequences of keeping the voice a patch rather than adding
a worklet to it.

1. **Pitch modulation saturates at one octave.** `bend`, `pitchEnv` and
   `pitchLfo` — and `detuneCoarse`/`detuneFine` on the pulse — are summed, in
   cents, on the oscillators' own `detune`, whose declared range is ±1200. An
   `AudioParam` clamps its _computed_ value, so a preset that asks for more than
   an octave of total pitch movement gets an octave. A three-octave laser sweep
   is a patch of its own, because doing it properly means `2^(cents/1200)` and
   that is a worklet, not a `GainNode`.
2. **Key tracking is linear in Hz**, not exponential: the cutoff rises by
   `keyTrack × the note's frequency`. At 1 the top of the keyboard is as bright
   as the bottom; it is not the 2×-per-octave of an analogue exponential CV,
   which again would need a worklet. Every brass and flute recipe in the book
   asks for less than 100% anyway.
3. **Tremolo rides on the output gain**, which sits at 1: the level swings
   between `1 − tremolo` and `1 + tremolo`. At full depth the trough is silence
   and the peak is twice the note's own level.

One more, which is not a limit so much as a choice: **the noise is always
white**. Pink is a different generator and a `noiseType` parameter would be a
thirty-second; the flute recipe, which wants breath, builds its own noise path
(ticket 13, "Chapter 8: Recipes").

## Testing

`learn-voice.test.ts` runs with the site's own vitest, which ticket 02 ("Content
model and the three layers") installed along with `site/vitest.config.ts`:

```sh
npm --prefix site test           # the whole site suite
npm --prefix site test -- learn/voice   # this file alone
```

The `// @ts-ignore` that stood on the `vitest` import while the package was
missing is gone with it.

Twenty-one tests, in two halves. The schema half needs no audio: the thirty-one
parameters, the groups, the option lists, every preset key a declared parameter,
every preset value inside its range, every parameter addressed by at least one
preset. The sound half renders the voice on an `OfflineAudioContext` through
`node-web-audio-api` — real worklets in node, the same harness
`packages/synthlet/src/offline.test.ts` uses — and asserts silence before the
note, sound after it, a release that falls, thirty-one `AudioParam`s sitting at
their declared defaults, every preset in both banks loading without a throw, a
chord on `strings` whose slow attack is measurable, and that two renders of the
same graph are sample-identical.

That last one stands in for the "stored checksum" the ticket asks for.
Determinism is the property an offline render is actually for; a hash of the
samples would pin this file to today's `polyblep` and fail on every unrelated
DSP improvement.

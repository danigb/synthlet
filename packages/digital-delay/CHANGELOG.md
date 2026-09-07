# @synthlet/digital-delay

## 0.1.0

### Minor Changes

- b1ebc74: Initial release: a stereo feedback delay whose loop filters, diffuses
  and saturates.

  Web Audio has a `DelayNode`, so the delay line itself is solved. What it
  cannot do is put that line **in a loop**. The spec allows a cycle in the graph
  only if the cycle contains a `DelayNode`, and that node's effective delay is
  clamped to at least one render quantum — 128 samples, 2.90 ms at 44.1 kHz.
  Below that floor nothing is expressible: no flanger, no comb resonance, no
  tight slapback. Above it, a hand-built `DelayNode → GainNode → DelayNode` loop
  still leaves a bare scalar in the feedback path — no filter, no saturation,
  and no say in what happens when you move the delay time while audio is in the
  line.

  ```ts
  const delay = DigitalDelay(ac, {
    time: 0.25, // seconds
    feedback: 0.5,
    tone: -0.3, // darken each repeat
    cross: 1, // ping-pong
    diffuse: 0.4,
  });
  source.connect(delay).connect(ac.destination);
  ```

  One algorithm, no modes, and eight `AudioParam`s — so every one is a CV
  destination: `time` (0.0002–2 s, spanning flanger through comb resonance to a
  long echo), `feedback` (0–1.2), `mix`, `tone`, `mod`, `spread`, `cross` and
  `diffuse`. One construction option, `maxTime` (default 2 s), sizes the
  buffers; it is not an `AudioParam` because it allocates.

  **"Digital" means only "the one that isn't analog."** It is a clean modern
  delay, not a model of a PCM42 or an SDE-3000. Its defining behaviour is that
  **changing `time` preserves pitch**: the read head hands over to a second head
  and crossfades rather than gliding — measured at a median 440.4 Hz through a
  sweep where a glide reads 733 Hz. The pitch-bending half is
  `@synthlet/analog-delay`.

  Four things worth knowing:

  - **`feedback` above 1 is intentional.** Self-oscillation is a destination,
    bounded by the loop's soft limiter: at 1.2 over 60 s it peaks at 0.78, still
    oscillating, with no NaN and no denormal stall.
  - **`spread` and `cross` are two parameters, not one** — the L/R time
    relationship and the feedback matrix are independent axes. Folded into a
    single "stereo" morph the midpoint would mean nothing.
  - **`mod` is not an LFO on `time`.** It moves the pointer within the current
    read head, which bends pitch; an `Lfo` into `time` gives continuous
    handovers instead.
  - **The feedback path always carries three things**, whatever `tone` says: the
    tilt, a high-pass whose corner rises with `feedback` so sub-bass cannot pile
    up, and a soft limiter. The last two are what make `feedback = 1.2` a
    musical limit cycle rather than a clip.

  There is no tempo-sync parameter. `time` is seconds and an `AudioParam`: work
  the beat division out, or drive it from a node.

  The DSP is original, derived from published descriptions — Schlecht & Habets
  on lossless feedback delay networks, Niemitalo on Hermite interpolators,
  Dattorro on allpass diffusion, and Mutable Instruments' Clouds for the
  feedback high-pass and limiter. Each measured quality claim above is an
  assertion in `src/dsp.test.ts`.

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

// Every package carries its own copy of the module contract rather than
// depending on a shared one, so that installing any single package pulls in
// nothing else - all 22 declare `dependencies: {}`. That is a deliberate
// packaging choice, not an oversight: a `@synthlet/core` would put a shared
// dependency in every consumer's graph to save about 1.3 KB.
//
// Duplicating it is safe because the helpers are pure functions and
// `createRegistrar` keys its per-context cache by processor *name* rather than
// module identity - so two copies still register a worklet exactly once.
//
// The copies are made by `scripts/copy_files.sh`, which no build step, turbo
// task or workflow runs. This test is what keeps them honest.

const root = resolve(__dirname, "../../..");
const source = readFileSync(join(root, "scripts/_worklet.ts"), "utf8");

const packages = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("the module contract", () => {
  it("is shared by more than one package", () => {
    // Guards the per-package assertions below against passing vacuously.
    expect(packages.length).toBeGreaterThan(1);
  });
});

describe.each(packages)("%s", (pkg) => {
  const copy = join(root, "packages", pkg, "src/_worklet.ts");

  it("carries a copy of the module contract", () => {
    expect(existsSync(copy)).toBe(true);
  });

  it("has not drifted from scripts/_worklet.ts", () => {
    // Failing here means the copies disagree. `scripts/_worklet.ts` is the
    // only editable original: edit it, then run `bash scripts/copy_files.sh`.
    expect(readFileSync(copy, "utf8")).toBe(source);
  });
});

// The gate/trigger contract is copied the same way, but only into the packages
// that produce or consume a gate - the ones detection must not drift between.
const gateSource = readFileSync(join(root, "scripts/_gate.ts"), "utf8");
const gatePackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_gate.ts")),
);

describe("the gate contract", () => {
  it("is shared by every package that detects or emits a gate", () => {
    expect(gatePackages).toEqual([
      "ad",
      "adsr",
      "arp",
      "clock",
      "euclid",
      "impulse",
      "karplus-strong",
      // The first entry that is neither an envelope, a clock, nor an
      // oscillator: a modulation source that takes a reset. A rising edge on
      // `Lfo.sync` restarts the phase, which is what makes a vibrato
      // per-note, two slow LFOs independent, and `clock.gate -> lfo.sync` the
      // whole of tempo sync.
      //
      // Its a-rate ground is **reach, not jitter**. 2.9 ms of quantisation is
      // nothing against a 5 Hz cycle - the argument below does not apply here,
      // and this package deliberately does not interpolate the crossing
      // instant. What a-rate buys is that `sync` accepts any signal in the
      // library, which is the same shape `check-param-rates.mjs` and
      // `descriptors.test.ts` pin for every other event param.
      "lfo",
      // The two consumers that are neither an envelope nor a clock: both take
      // a rising edge on `sync` as a hard-sync reset, and both detect it with
      // the shared detector rather than a second one of their own. They are
      // also the two that read a gate a-rate, because they need the sub-sample
      // instant of the crossing and not only the block it fell in - a reset
      // quantised to a render quantum is 2.9 ms of jitter at 44.1 kHz. The
      // arithmetic that turns that instant into a phase stays in each
      // package's own `dsp.ts`.
      "polyblep-oscillator",
      "wavetable-oscillator",
    ]);
  });
});

describe.each(gatePackages)("%s", (pkg) => {
  it("has not drifted from scripts/_gate.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_gate.ts"), "utf8"),
    ).toBe(gateSource);
  });
});

// And the band-limiting kernels, under the same rule: the packages that have a
// discontinuity to correct. `wavetable-oscillator` uses them for hard sync;
// `polyblep-oscillator` adopted them when it was rewritten on a discontinuity
// scheduler, which is what makes them shared rather than one package's private
// table. `lfo` is the intended next consumer, and opts in the same way - one
// `cp` and one entry in the list below.
const blepSource = readFileSync(join(root, "scripts/_blep.ts"), "utf8");
const blepPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_blep.ts")),
);

describe("the band-limiting kernels", () => {
  it("are shared by every package that corrects a discontinuity", () => {
    expect(blepPackages).toEqual([
      "polyblep-oscillator",
      "wavetable-oscillator",
    ]);
  });
});

describe.each(blepPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_blep.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_blep.ts"), "utf8"),
    ).toBe(blepSource);
  });
});

// The delay line is copied the same way, but only into the packages that need
// a circular buffer. `digital-delay` wrote it and `analog-delay` is the proof
// it is genuinely shared rather than a private ring buffer with a public name:
// the two read it differently - a crossfade between two heads against a glide
// towards one - and neither needed a change to the primitive. `granite` is the
// third read strategy over the same storage, a cloud of up to 64 independent
// playheads, and it needed no change either: a grain playhead is a *moving
// delay*, which is what the masked wrap and the Hermite read already are.
// `chorus` is the fourth, and the one this file's header was written for: it
// carried a Faust bitmask ring and a two-point linear read across eight
// voices, which is the one combination Dattorro rules out by name. It needed
// no change to the primitive either - a chorus voice is a delay whose read
// position an LFO moves, which the masked wrap and the Hermite read already
// are.
// Six packages grew their own before it existed and none of them adopt it
// retroactively for free: `karplus-strong` is next, and swapping its linear
// interpolator removes the accidental lowpass that is currently its only
// damping, so that adoption is coupled to its ticket 04 rather than done here.
const delaySource = readFileSync(join(root, "scripts/_delay.ts"), "utf8");
const delayPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_delay.ts")),
);

describe("the delay line", () => {
  it("is shared by every package that needs a circular buffer", () => {
    expect(delayPackages).toEqual([
      "analog-delay",
      "chorus",
      "digital-delay",
      "granite",
    ]);
  });
});

describe.each(delayPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_delay.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_delay.ts"), "utf8"),
    ).toBe(delaySource);
  });
});

// The measuring instrument is copied the same way, and is the only shared file
// here that no shipped code imports: it exists so that two packages' alias-SNR
// and spectrum numbers are comparable. `granite` is the third, and its reading
// is a new one - the modulation depth of a grain stream, taken from the spectrum
// of the squared signal - so its FFT and window have to be the same ones the
// other two are calibrated against. `polyblep-oscillator` is the obvious next
// consumer and deliberately does not carry a copy yet: it grew its own
// `spectrum.ts` in parallel, pinned to the two sawtooth rows its audit
// published, and adopting this one has to be a deliberate step that re-pins
// those numbers rather than a `cp` performed by a merge.
const spectrumSource = readFileSync(join(root, "scripts/_spectrum.ts"), "utf8");
const spectrumPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_spectrum.ts")),
);

describe("the measuring instrument", () => {
  it("is shared by every package whose tests measure a spectrum", () => {
    expect(spectrumPackages).toEqual([
      // `chorus` reads it for delay in milliseconds, LFO rate in hertz and
      // L/R correlation, none of which its old suite could see: every defect
      // the rewrite fixed passed a test that only asked whether the output
      // was finite and non-zero.
      "chorus",
      "digital-delay",
      "granite",
      "lfo",
      // The one whose numbers *are* the module's argument for existing. A ring
      // modulator is told from a VCA by what is missing from its spectrum -
      // Part 11's "the Modulator has completely disappeared" - so the test
      // that matters reads two peaks and a floor at the two input
      // frequencies, and it has to read them the same way `lfo` does.
      "ring-mod",
      "virtual-analog-filter",
      "wavetable-oscillator",
    ]);
  });
});

describe.each(spectrumPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_spectrum.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_spectrum.ts"), "utf8"),
    ).toBe(spectrumSource);
  });
});

// And the levels transport, under the same rule - but the strongest case for it
// yet, because here the thing that has to line up is the *reader*. One
// `LevelMeterUI`, one React hook and one `subscribe` are meant to draw every
// package's meter; two packages writing their own transports would leave the
// renderer able to draw only one of them. `level-meter` wrote it and
// `lookahead-limiter` is the proof it is shared rather than one package's
// private buffer with a public name: the limiter reports a single number,
// gain reduction in dB, and needed no change to the primitive. The instrument
// module is the intended next consumer - one slot per voice - and opts in the
// same way, one `cp` and one entry in the list below.
const levelsSource = readFileSync(join(root, "scripts/_levels.ts"), "utf8");
const levelsPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_levels.ts")),
);

describe("the levels transport", () => {
  it("is shared by every package that meters something", () => {
    expect(levelsPackages).toEqual(["level-meter", "lookahead-limiter"]);
  });
});

describe.each(levelsPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_levels.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_levels.ts"), "utf8"),
    ).toBe(levelsSource);
  });
});

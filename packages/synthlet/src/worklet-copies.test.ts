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
      // The one consumer that is not an envelope or a clock: `sync`, whose
      // rising edge restarts the table read. It is also the one that reads the
      // gate a-rate, because it needs the sub-sample instant of the crossing
      // and not only the block - see `wavetable-oscillator/src/params.ts`.
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
// discontinuity to correct. `wavetable-oscillator` is the first, for hard sync;
// `polyblep-oscillator` is the intended next, and adopts them with the ticket
// that rewrites it on a discontinuity scheduler rather than here.
const blepSource = readFileSync(join(root, "scripts/_blep.ts"), "utf8");
const blepPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_blep.ts")),
);

describe("the band-limiting kernels", () => {
  it("are shared by every package that corrects a discontinuity", () => {
    expect(blepPackages).toEqual(["wavetable-oscillator"]);
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
// a circular buffer. Six packages grew their own before it existed and none of
// them adopt it retroactively for free: `karplus-strong` is the intended next
// consumer, and swapping its linear interpolator removes the accidental
// lowpass that is currently its only damping, so that adoption is coupled to
// its ticket 04 rather than done here.
const delaySource = readFileSync(join(root, "scripts/_delay.ts"), "utf8");
const delayPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_delay.ts")),
);

describe("the delay line", () => {
  it("is shared by every package that needs a circular buffer", () => {
    expect(delayPackages).toEqual(["digital-delay"]);
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
// and spectrum numbers are comparable. `polyblep-oscillator` is the obvious
// third consumer and deliberately does not carry a copy yet - it has no
// spectrum test on this branch, and the opt-in rule above exists precisely so
// that a package does not get a file nothing imports.
const spectrumSource = readFileSync(join(root, "scripts/_spectrum.ts"), "utf8");
const spectrumPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_spectrum.ts")),
);

describe("the measuring instrument", () => {
  it("is shared by every package whose tests measure a spectrum", () => {
    expect(spectrumPackages).toEqual(["digital-delay", "wavetable-oscillator"]);
  });
});

describe.each(spectrumPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_spectrum.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_spectrum.ts"), "utf8"),
    ).toBe(spectrumSource);
  });
});

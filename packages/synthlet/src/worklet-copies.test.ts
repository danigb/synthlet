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

// The delay line is copied the same way, but only into the packages that need
// a circular buffer. `digital-delay` wrote it and `analog-delay` is the proof
// it is genuinely shared rather than a private ring buffer with a public name:
// the two read it differently - a crossfade between two heads against a glide
// towards one - and neither needed a change to the primitive. Six packages
// grew their own before it existed and none of them adopt it retroactively for
// free: `karplus-strong` is next, and swapping its linear interpolator removes
// the accidental lowpass that is currently its only damping, so that adoption
// is coupled to its ticket 04 rather than done here.
const delaySource = readFileSync(join(root, "scripts/_delay.ts"), "utf8");
const delayPackages = packages.filter((pkg) =>
  existsSync(join(root, "packages", pkg, "src/_delay.ts")),
);

describe("the delay line", () => {
  it("is shared by every package that needs a circular buffer", () => {
    expect(delayPackages).toEqual(["analog-delay", "digital-delay"]);
  });
});

describe.each(delayPackages)("%s", (pkg) => {
  it("has not drifted from scripts/_delay.ts", () => {
    expect(
      readFileSync(join(root, "packages", pkg, "src/_delay.ts"), "utf8"),
    ).toBe(delaySource);
  });
});

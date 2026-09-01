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

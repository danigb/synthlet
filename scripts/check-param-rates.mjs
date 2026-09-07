#!/usr/bin/env node
//
// Every parameter declared `a-rate` must be read per sample.
//
// Rate bugs are silent. A k-rate read of an a-rate parameter does not throw,
// does not warn, and produces audio that still sounds like audio - every one of
// them found while writing the automation-rate folder was found by reading the
// code, not by running it. `virtual-analog-filter/src/worklet.ts` passed a whole
// `Float32Array` through `Math.floor` from the day it was written and no test
// would ever have caught it: `Math.floor` coerces, and a length-1 array
// stringifies to its single value, so it was correct for exactly as long as its
// parameter stayed k-rate.
//
// So this reads the descriptor and the processor together, which is the only
// thing that could have caught it. It flags, in a package's own sources:
//
//   params.<a-rate name>[0]         a k-rate read of an a-rate parameter
//   parameters.<a-rate name>[0]     the same, spelled the other way
//   Math.floor(params.<name>)       the whole array in a numeric context
//
// A read that genuinely wants the first value - priming a filter's state before
// the loop, say - declares itself with a `rate-ok:` comment naming the reason,
// on the same line or the line above. There is no silent exemption.
//
//   npm run check:rates
//   node scripts/check-param-rates.mjs --root path/to/a/fixture
//
// Plain JavaScript rather than the `.ts` the ticket named: the workspace has no
// TypeScript runner, and one 200-line guard is not a reason to add a dependency.
// `benchmarks/automation-rate/run-chrome.mjs` is the same shape for the same
// reason.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DEFAULT_ROOT = resolve(import.meta.dirname, "..");

/** Files a package's processor can live in. Tests and bundles are not code. */
const SOURCE = /\.ts$/;
const SKIP = new Set(["processor.ts", "_processor.ts"]);
const isSource = (name) =>
  SOURCE.test(name) && !name.includes(".test.") && !SKIP.has(name);

/** `rate-ok:` on this line or the one above declares a deliberate `[0]` read. */
const EXEMPT = /rate-ok:/;

/**
 * The code on a line, with any trailing `//` comment and any line that is
 * wholly a comment removed. The whole point of this guard is that these files
 * *explain* their rate choices, so the prose quotes the broken spellings
 * constantly - the header of `virtual-analog-filter/src/worklet.ts` is a
 * paragraph about why `Math.floor(params.type)` was wrong. Matching prose would
 * make the guard fire on its own documentation.
 *
 * Deliberately not a parser: it does not know about block comments spanning
 * lines, which is why a `*` continuation line is dropped too.
 */
function code(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) return "";
  const comment = line.indexOf("//");
  return comment === -1 ? line : line.slice(0, comment);
}

/**
 * The a-rate parameter names a `params.ts` declares.
 *
 * A regex over the literal rather than a TypeScript parse: every package's
 * `params.ts` is one flat array of object literals with `name` and
 * `automationRate` keys, by convention and by `worklet-copies.test.ts`'s
 * insistence that they all look alike. The failure mode of a regex here is a
 * guard that quietly checks nothing, so a `params.ts` that parses to *zero*
 * parameters is itself reported: the shape has changed and this needs looking
 * at, rather than passing because it found nothing to complain about.
 */
function aRateNames(source) {
  const names = [];
  let total = 0;
  const entry = /name:\s*"([^"]+)"[\s\S]*?automationRate:\s*"(a-rate|k-rate)"/g;
  for (const [, name, rate] of source.matchAll(entry)) {
    total++;
    if (rate === "a-rate") names.push(name);
  }
  return { names, total };
}

function findings(root) {
  const packages = join(root, "packages");
  const out = [];

  for (const pkg of readdirSync(packages).sort()) {
    const src = join(packages, pkg, "src");
    let paramsSource;
    try {
      paramsSource = readFileSync(join(src, "params.ts"), "utf8");
    } catch {
      continue; // A package with no parameters declares no rates.
    }

    const { names, total } = aRateNames(paramsSource);
    if (total === 0) {
      out.push({
        file: relative(root, join(src, "params.ts")),
        line: 1,
        param: "-",
        text: "params.ts declares no parameters - has its shape changed?",
      });
    }
    if (names.length === 0) continue;

    for (const file of readdirSync(src).filter(isSource).sort()) {
      const path = join(src, file);
      if (!statSync(path).isFile()) continue;
      const lines = readFileSync(path, "utf8").split("\n");

      for (const name of names) {
        // `params.x[0]` / `parameters.x[0]`, and the same through a
        // destructured local: `const { x } = params` then `x[0]`.
        const indexed = new RegExp(
          `\\b(?:params|parameters)\\.${name}\\s*\\[\\s*0\\s*\\]`,
        );
        // The whole array where a number is wanted: `Math.floor(params.x)`,
        // `params.x * 2`, `+params.x`. Deliberately narrow - a bare
        // `params.x` passed on to a function that reads it per sample is the
        // correct thing to do, and `karplus-strong` does exactly that.
        const coerced = new RegExp(
          `\\b(?:Math\\.\\w+\\(\\s*(?:params|parameters)\\.${name}\\s*[,)]` +
            `|(?:params|parameters)\\.${name}\\s*[*/%+-]\\s*\\d)`,
        );

        lines.forEach((line, i) => {
          const source = code(line);
          if (!indexed.test(source) && !coerced.test(source)) return;
          if (EXEMPT.test(line) || EXEMPT.test(lines[i - 1] ?? "")) return;
          out.push({
            file: relative(root, path),
            line: i + 1,
            param: name,
            text: line.trim(),
          });
        });
      }
    }
  }

  return out;
}

const rootFlag = process.argv.indexOf("--root");
const root =
  rootFlag === -1 ? DEFAULT_ROOT : resolve(process.argv[rootFlag + 1]);

const problems = findings(root);

if (problems.length === 0) {
  console.log("check-param-rates: every a-rate parameter is read per sample.");
  process.exit(0);
}

console.error(
  `check-param-rates: ${problems.length} a-rate parameter${
    problems.length === 1 ? "" : "s"
  } read as if k-rate.\n`,
);
for (const { file, line, param, text } of problems) {
  console.error(`  ${file}:${line}  \`${param}\` is declared a-rate`);
  console.error(`    ${text}\n`);
}
console.error(
  "Read it per sample with the hoisted `length > 1` idiom - see\n" +
    "`scripts/_worklet.ts`, next to `ParamDescriptor` - or, if reading the\n" +
    "first value is deliberate, say so with a `rate-ok: <reason>` comment.",
);
process.exit(1);

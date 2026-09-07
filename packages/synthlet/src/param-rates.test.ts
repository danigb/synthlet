import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// `scripts/check-param-rates.mjs` is the durable half of automation-rate ticket
// 05. Rate bugs are silent - a k-rate read of an a-rate parameter does not
// throw, does not warn, and produces audio that still sounds like audio - so
// what stops the next one is a check that reads the descriptor and the
// processor together.
//
// A guard nobody has watched fail is a guard that passes. This runs it against
// the library (which must pass) and against fixtures carrying each shape it
// exists to catch (which must fail), so "it is wired into CI" means something.

const root = resolve(__dirname, "../../..");
const script = join(root, "scripts/check-param-rates.mjs");

/** Runs the guard, returning its exit code and everything it printed. */
function check(against: string) {
  try {
    const stdout = execFileSync("node", [script, "--root", against], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error: any) {
    return { code: error.status as number, output: `${error.stderr ?? ""}` };
  }
}

/** A one-package fixture library: a `params.ts` and a `worklet.ts`. */
function fixture(params: string, worklet: string) {
  const dir = mkdtempSync(join(tmpdir(), "param-rates-"));
  const src = join(dir, "packages/example/src");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "params.ts"), params);
  writeFileSync(join(src, "worklet.ts"), worklet);
  return dir;
}

const descriptor = (name: string, rate: "a-rate" | "k-rate") => `
  {
    name: "${name}",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "${rate}",
  },`;

const paramsFile = (...entries: string[]) =>
  `export const PARAMS = [${entries.join("")}\n];\n`;

describe("check-param-rates", () => {
  const fixtures: string[] = [];
  const build = (params: string, worklet: string) => {
    const dir = fixture(params, worklet);
    fixtures.push(dir);
    return dir;
  };

  afterAll(() => {
    for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
  });

  it("passes on the library", () => {
    // This is the assertion that 01-04 left nothing behind, and the one that
    // fails first if a later package declares a rate it does not honour.
    const { code, output } = check(root);
    expect(output).toContain("every a-rate parameter is read per sample");
    expect(code).toBe(0);
  });

  it("catches the common shape: an a-rate parameter read at [0]", () => {
    const dir = build(
      paramsFile(descriptor("gate", "a-rate")),
      `export class P {
  process(inputs: any, outputs: any, params: any) {
    const gate = params.gate[0];
    return gate;
  }
}
`,
    );

    const { code, output } = check(dir);
    expect(code).toBe(1);
    // Names the file, the parameter and the line.
    expect(output).toContain("packages/example/src/worklet.ts:3");
    expect(output).toContain("`gate` is declared a-rate");
    expect(output).toContain("const gate = params.gate[0];");
  });

  it("catches the real one: the whole array in a numeric context", () => {
    // `virtual-analog-filter/src/worklet.ts` read `Math.floor(params.type)` for
    // its whole life. `Math.floor` coerces, a `Float32Array` stringifies
    // through `join`, and a length-1 array stringifies to its single value - so
    // it was correct for exactly as long as `type` stayed k-rate. No test would
    // have caught it. This is the regression test for the guard itself.
    const dir = build(
      paramsFile(descriptor("type", "a-rate")),
      `export class P {
  process(inputs: any, outputs: any, params: any) {
    const type = Math.floor(params.type);
    return type;
  }
}
`,
    );

    const { code, output } = check(dir);
    expect(code).toBe(1);
    expect(output).toContain("`type` is declared a-rate");
    expect(output).toContain("Math.floor(params.type)");
  });

  it("does not flag a k-rate parameter read at [0]", () => {
    // Which is the correct and complete read for one.
    const dir = build(
      paramsFile(descriptor("scale", "k-rate")),
      `export class P {
  process(inputs: any, outputs: any, params: any) {
    return params.scale[0];
  }
}
`,
    );
    expect(check(dir).code).toBe(0);
  });

  it("does not flag the hoisted `length > 1` idiom", () => {
    const dir = build(
      paramsFile(descriptor("gate", "a-rate"), descriptor("gain", "k-rate")),
      `export class P {
  process(inputs: any, outputs: any, params: any) {
    const { gate } = params;
    const gateRate = gate.length > 1;
    const gain = params.gain[0];
    const out = [];
    for (let i = 0; i < 128; i++) out[i] = (gateRate ? gate[i] : gate[0]) * gain;
    return out;
  }
}
`,
    );
    expect(check(dir).code).toBe(0);
  });

  it("does not flag a parameter passed on whole to be read per sample", () => {
    // `karplus-strong` does exactly this, and it is the right thing to do.
    const dir = build(
      paramsFile(descriptor("trigger", "a-rate")),
      `export class P {
  process(inputs: any, outputs: any, params: any) {
    return this.g(params.trigger, params.frequency);
  }
}
`,
    );
    expect(check(dir).code).toBe(0);
  });

  it("accepts a declared `rate-ok:` read, and only a declared one", () => {
    // Priming state before the loop is a real reason to read [0]. It has to be
    // said out loud - there is no silent exemption.
    const worklet = (comment: string) => `export class P {
  process(inputs: any, outputs: any, params: any) {
${comment}    const seed = params.frequency[0];
    return seed;
  }
}
`;

    const declared = build(
      paramsFile(descriptor("frequency", "a-rate")),
      worklet(
        "    // rate-ok: seeds the filter state before the sample loop.\n",
      ),
    );
    expect(check(declared).code).toBe(0);

    const undeclared = build(
      paramsFile(descriptor("frequency", "a-rate")),
      worklet("    // seeds the filter state before the sample loop.\n"),
    );
    expect(check(undeclared).code).toBe(1);
  });

  it("reports a params.ts it could not read rather than passing", () => {
    // The failure mode of a regex is a guard that quietly checks nothing.
    const dir = build(
      "export const PARAMS = buildDescriptors();\n",
      "export class P {}\n",
    );
    const { code, output } = check(dir);
    expect(code).toBe(1);
    expect(output).toContain("declares no parameters");
  });
});

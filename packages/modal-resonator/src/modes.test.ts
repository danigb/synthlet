import {
  bell,
  cowbell,
  harmonic,
  kettleDrum,
  membrane,
  MODES,
  stiffString,
} from "./modes";

/**
 * The tables, against the book.
 *
 * `docs/synth-secrets.md` lives in the development repository rather than in
 * this one, so the book's numbers are transcribed here with the line each came
 * from. Where a table carries a choice the book does not make - a level, a
 * decay - the test pins it as this library's, not as Reid's.
 */

const ratios = (modes: { ratio: number }[]) => modes.map((m) => m.ratio);
const levels = (modes: { level: number }[]) => modes.map((m) => m.level);
const decays = (modes: { decay: number }[]) => modes.map((m) => m.decay);

describe("harmonic", () => {
  it("is ratios 1...n at 1/n with unit decays", () => {
    const modes = harmonic(8);
    expect(ratios(modes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(levels(modes).every((level) => level === 1 / 8)).toBe(true);
    expect(decays(modes).every((decay) => decay === 1)).toBe(true);
  });

  it("sums to 1, so brightness alone sets the tilt", () => {
    const sum = levels(harmonic(32)).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("is claves at one mode", () => {
    expect(harmonic(1)).toEqual([{ ratio: 1, level: 1, decay: 1 }]);
  });
});

describe("membrane (Part 31)", () => {
  it("is the twelve low-order modes of the ideal membrane", () => {
    // docs/synth-secrets.md:3899-3912
    expect(ratios(membrane())).toEqual([
      1.0, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5, 3.6, 3.65, 4.06, 4.15,
    ]);
  });
});

describe("kettleDrum (Part 32)", () => {
  it("has Table 1's ratios", () => {
    // docs/synth-secrets.md:4018-4027
    expect(ratios(kettleDrum())).toEqual([1.0, 1.5, 1.98, 2.44]);
  });

  it("puts Table 2's frequencies at a 150 Hz principal", () => {
    // docs/synth-secrets.md:4049-4055: 150, 225, 297, 366 Hz
    expect(ratios(kettleDrum()).map((r) => Math.round(150 * r))).toEqual([
      150, 225, 297, 366,
    ]);
  });

  it("has the 5 : 4 : 3 : 1 amplitudes", () => {
    // docs/synth-secrets.md:4032
    const [first, ...rest] = levels(kettleDrum());
    expect([first, ...rest].map((l) => (l / first) * 5)).toEqual([
      5,
      expect.closeTo(4, 12),
      expect.closeTo(3, 12),
      expect.closeTo(1, 12),
    ]);
  });

  it("has the 45 : 73 : 91 : 84 decays verbatim", () => {
    // docs/synth-secrets.md:4030
    expect(decays(kettleDrum())).toEqual([0.45, 0.73, 0.91, 0.84]);
  });
});

describe("bell (Part 40)", () => {
  const modes = bell();

  it("tunes the strike partials 2 : 3 : 4 over the missing fundamental", () => {
    // docs/synth-secrets.md:5119
    for (const ratio of [2, 3, 4]) expect(ratios(modes)).toContain(ratio);
    expect(ratios(modes)).not.toContain(1);
  });

  it("has a near-degenerate pair that beats", () => {
    // docs/synth-secrets.md:5123
    const pair = ratios(modes).filter((r) => r >= 2 && r < 2.05);
    expect(pair).toHaveLength(2);
    expect(Math.abs(pair[1] - pair[0]) / pair[0]).toBeLessThan(0.01);
  });

  it("has a hum an octave below that outlasts everything", () => {
    // docs/synth-secrets.md:5117, :5141
    const hum = modes.find((m) => m.ratio === 0.5)!;
    expect(hum).toBeDefined();
    expect(hum.decay).toBe(Math.max(...decays(modes)));
  });
});

describe("cowbell (Part 41)", () => {
  const modes = cowbell();

  it("is two tones at 1 : 1.44", () => {
    // docs/synth-secrets.md:5181: 587 Hz and 845 Hz
    expect([...new Set(ratios(modes))]).toEqual([1, 1.44]);
    expect(Math.round(587 * 1.44)).toBe(845);
  });

  it("gives each tone an impact and a tail", () => {
    // docs/synth-secrets.md:5187: a short, loud impact and a longer tail
    for (const ratio of [1, 1.44]) {
      const rows = modes.filter((m) => m.ratio === ratio);
      expect(rows).toHaveLength(2);
      const [impact, tail] = [...rows].sort((a, b) => a.decay - b.decay);
      expect(impact.level).toBeGreaterThan(tail.level);
      expect(tail.decay).toBeGreaterThan(impact.decay);
    }
  });

  it("puts a little more of the higher tone than the lower", () => {
    // docs/synth-secrets.md:5211
    const sum = (ratio: number) =>
      levels(modes.filter((m) => m.ratio === ratio)).reduce((a, b) => a + b);
    expect(sum(1.44)).toBeGreaterThan(sum(1));
  });
});

describe("stiffString", () => {
  it("is harmonic with no stiffness", () => {
    expect(stiffString(0, 12)).toEqual(harmonic(12));
  });

  it("stretches the series and keeps mode 1 at the fundamental", () => {
    const modes = ratios(stiffString(0.001, 16));
    expect(modes[0]).toBe(1);
    for (let k = 1; k < modes.length; k++) {
      // Every partial sharper than its harmonic, and more so the higher it is.
      expect(modes[k]).toBeGreaterThan(k + 1);
      expect(modes[k] / (k + 1)).toBeGreaterThan(modes[k - 1] / k);
    }
  });
});

describe("the tables", () => {
  it("are fresh arrays every call", () => {
    for (const make of [
      () => harmonic(4),
      membrane,
      kettleDrum,
      bell,
      cowbell,
      () => stiffString(0.001, 4),
    ]) {
      const first = make();
      first[0].ratio = 99;
      first.pop();
      expect(make()[0].ratio).not.toBe(99);
      expect(make().length).toBe(first.length + 1);
    }
  });

  it("are all reachable from MODES", () => {
    expect(Object.keys(MODES).sort()).toEqual(
      [
        "bell",
        "cowbell",
        "harmonic",
        "kettleDrum",
        "membrane",
        "stiffString",
      ].sort(),
    );
  });

  it("have positive, finite fields", () => {
    for (const modes of [
      harmonic(8),
      membrane(),
      kettleDrum(),
      bell(),
      cowbell(),
      stiffString(0.0005, 32),
    ]) {
      for (const { ratio, level, decay } of modes) {
        expect(ratio > 0 && Number.isFinite(ratio)).toBe(true);
        expect(level > 0 && Number.isFinite(level)).toBe(true);
        expect(decay > 0 && Number.isFinite(decay)).toBe(true);
      }
    }
  });
});

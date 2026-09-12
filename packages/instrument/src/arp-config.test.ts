import { ArpConfig, toArpConfig } from "./arp-config";

describe("ArpConfig", () => {
  it("fills every default", () => {
    // Complete, not a diff - the same rule `presets.ts` applies to a preset,
    // and what lets a config round-trip through `getPreset` as one value.
    expect(ArpConfig("Up")).toEqual({
      mode: "Up",
      order: "pitch",
      octaves: 1,
      octaveMode: "serial",
    });
  });

  it("takes every field", () => {
    expect(
      ArpConfig("UpDownExclusive", {
        order: "played",
        octaves: 2,
        octaveMode: "repeat",
      }),
    ).toEqual({
      mode: "UpDownExclusive",
      order: "played",
      octaves: 2,
      octaveMode: "repeat",
    });
  });

  it("is frozen", () => {
    // A config is a value: two instruments may hold the same one, and a
    // pattern edit is a new value rather than a mutation nobody can see.
    const config = ArpConfig("Up") as { mode: string };
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      "use strict";
      config.mode = "Down";
    }).toThrow();
  });

  it("accepts Chord, which only a polyphonic output can have", () => {
    expect(ArpConfig("Chord").mode).toBe("Chord");
  });

  it("throws on an unknown mode, listing the seven", () => {
    expect(() => ArpConfig("Sideways" as any)).toThrow(
      /Unknown arp mode "Sideways"; known: Up, Down, .*, Chord/,
    );
  });

  it("throws on an unknown option key, naming it", () => {
    // `latch` is the one somebody will actually try, because the ticket put it
    // here. It is a performance control and lives on the instrument.
    expect(() => ArpConfig("Up", { latch: true } as any)).toThrow(
      /Unknown arp option "latch"; known: order, octaves, octaveMode/,
    );
  });

  it("throws on an unknown order or octave mode", () => {
    expect(() => ArpConfig("Up", { order: "random" as any })).toThrow(
      /Unknown arp order "random"; known: pitch, played/,
    );
    expect(() => ArpConfig("Up", { octaveMode: "spiral" as any })).toThrow(
      /Unknown arp octave mode "spiral"/,
    );
  });

  it("clamps octaves silently into 1...4", () => {
    // The other of `presets.ts`'s two rules: a value out of range is a stale
    // file, not a mistake, so it is clamped rather than rejected.
    expect(ArpConfig("Up", { octaves: 9 }).octaves).toBe(4);
    expect(ArpConfig("Up", { octaves: 0 }).octaves).toBe(1);
    expect(ArpConfig("Up", { octaves: -3 }).octaves).toBe(1);
  });

  it("floors a fractional octave count", () => {
    // `octaves: 2.5` would make `len * octaves` fractional and every index
    // after it a fraction. `@synthlet/arp` floors its own for the same reason.
    expect(ArpConfig("Up", { octaves: 2.5 }).octaves).toBe(2);
  });

  it("survives a NaN", () => {
    expect(ArpConfig("Up", { octaves: NaN }).octaves).toBe(1);
  });
});

describe("toArpConfig", () => {
  it("passes null through: a plain poly", () => {
    expect(toArpConfig(null)).toBe(null);
    expect(toArpConfig(undefined)).toBe(null);
  });

  it("completes a partial object", () => {
    expect(toArpConfig({ mode: "Down" })).toEqual({
      mode: "Down",
      order: "pitch",
      octaves: 1,
      octaveMode: "serial",
    });
  });

  it("revalidates a config it is handed", () => {
    // A value from a JSON preset takes exactly the same path as a direct
    // `ArpConfig(...)` call, which is why a stale saved sound cannot smuggle
    // an unknown mode past the setter.
    expect(() => toArpConfig({ mode: "Sideways" } as any)).toThrow(
      /Unknown arp mode "Sideways"/,
    );
    expect(toArpConfig({ mode: "Up", octaves: 9 })!.octaves).toBe(4);
  });

  it("throws on an object with no mode", () => {
    expect(() => toArpConfig({ octaves: 2 } as any)).toThrow(
      /An arp config needs a mode/,
    );
  });

  it("returns a value equal to the one it was given", () => {
    const config = ArpConfig("RandomOther", { octaves: 3 });
    expect(toArpConfig(config)).toEqual(config);
  });
});

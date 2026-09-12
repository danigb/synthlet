import { ArpMode, ArpOctaveMode } from "./_traversal";
import { NotePriority, StealMode } from "./_voices";
import {
  ARP_MODE_NAMES,
  isArpModeName,
  resolveArpMode,
  resolveArpOctaveMode,
  resolveName,
  resolvePriority,
  resolveStealMode,
} from "./names";

// The user-zone/DSP-zone boundary. What these tests are for is that every name
// reaches its member and that a wrong one says so - the second half being the
// actual improvement, since `priority` had no runtime validation at all before
// and a preset loaded from a file is not checked by TypeScript.

describe("the note priorities", () => {
  it("resolves every name", () => {
    expect(resolvePriority("last")).toBe(NotePriority.Last);
    expect(resolvePriority("low")).toBe(NotePriority.Low);
    expect(resolvePriority("high")).toBe(NotePriority.High);
    expect(resolvePriority("first")).toBe(NotePriority.First);
  });

  it("throws on an unknown name, listing the four", () => {
    expect(() => resolvePriority("loud" as any)).toThrow(
      /Unknown note priority "loud"; known: last, low, high, first/,
    );
  });
});

describe("the steal modes", () => {
  it("resolves every name", () => {
    expect(resolveStealMode("protect")).toBe(StealMode.Protect);
    expect(resolveStealMode("lru")).toBe(StealMode.Lru);
    expect(resolveStealMode("mru")).toBe(StealMode.Mru);
    expect(resolveStealMode("drop")).toBe(StealMode.Drop);
  });

  it("throws on an unknown name, listing the four", () => {
    expect(() => resolveStealMode("oldest" as any)).toThrow(
      /Unknown steal mode "oldest"; known: protect, lru, mru, drop/,
    );
  });
});

describe("the arp modes", () => {
  it("resolves the six the traversal has", () => {
    expect(resolveArpMode("Up")).toBe(ArpMode.Up);
    expect(resolveArpMode("Down")).toBe(ArpMode.Down);
    expect(resolveArpMode("UpDownExclusive")).toBe(ArpMode.UpDownExclusive);
    expect(resolveArpMode("UpDownInclusive")).toBe(ArpMode.UpDownInclusive);
    expect(resolveArpMode("Random")).toBe(ArpMode.Random);
    expect(resolveArpMode("RandomOther")).toBe(ArpMode.RandomOther);
  });

  it("does not resolve Chord, which reads no position", () => {
    // It is a mode of the *instrument*, not of the traversal: there is no
    // index to read when every held note sounds. `arpStep` branches before it
    // would ever ask, and this is the assertion that the table agrees.
    expect(() => resolveArpMode("Chord" as any)).toThrow(
      /Unknown arp mode "Chord"/,
    );
    expect(isArpModeName("Chord")).toBe(true);
  });

  it("names all seven, Chord last", () => {
    expect(ARP_MODE_NAMES).toEqual([
      "Up",
      "Down",
      "UpDownExclusive",
      "UpDownInclusive",
      "Random",
      "RandomOther",
      "Chord",
    ]);
  });

  it("rejects a name that is not one of the seven", () => {
    expect(isArpModeName("UpDown")).toBe(false);
  });
});

describe("the arp octave modes", () => {
  it("resolves both names", () => {
    expect(resolveArpOctaveMode("serial")).toBe(ArpOctaveMode.Serial);
    expect(resolveArpOctaveMode("repeat")).toBe(ArpOctaveMode.Repeat);
  });

  it("throws on an unknown name", () => {
    expect(() => resolveArpOctaveMode("spiral" as any)).toThrow(
      /Unknown arp octave mode "spiral"; known: serial, repeat/,
    );
  });
});

describe("resolveName", () => {
  it("names the value and lists the known ones", () => {
    // `presets.ts`'s rule, which is the versioning story stated rather than
    // hidden behind a migration layer: the throw has to say what it got.
    expect(() => resolveName({ a: 1, b: 2 }, "c", "thing")).toThrow(
      'Unknown thing "c"; known: a, b',
    );
  });

  it("resolves a member whose value is falsy", () => {
    // Every one of these enums starts at 0, so a `||` here would reject the
    // first member of all four tables.
    expect(resolveName({ zero: 0 }, "zero", "thing")).toBe(0);
  });
});

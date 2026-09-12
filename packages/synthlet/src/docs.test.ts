import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as synthlet from "./index";
import type { ParamDescriptor } from "./_worklet";

/**
 * The docs, checked against the code they describe.
 *
 * `lfo.mdx`'s first code block used to construct an `Lfo` with an `amplitude`
 * parameter, which does not exist. `connectParams` throws on an unknown
 * *declared* name but silently ignores an unknown *input* key, so the example
 * failed by doing nothing: the LFO ran at full depth and the reader concluded
 * the library was broken. It was wrong for the life of the package.
 *
 * The same class of silence bit this folder's own work twice while it was being
 * written - a `README.md` table edited by string replacement stopped matching
 * after Prettier realigned its columns, so two tickets' rows were never added
 * and nothing said so.
 *
 * So the parameter table is checked against `descriptors` in both directions:
 * a name that is not a parameter cannot appear, and a parameter that exists
 * cannot be left out. `worklet-copies.test.ts` reads files off disk for the
 * same reason and this borrows its `root`.
 *
 * `arp` is the second entry, and it arrived because the class of silence above
 * bit it too: two of its tickets edited the README's parameter table by string
 * replacement, Prettier had realigned the columns since, and the `mode` range
 * and the whole `octaveMode` row were silently never written.
 */
const root = resolve(__dirname, "../../..");

const README = readFileSync(join(root, "packages/lfo/README.md"), "utf8");
const PAGE = readFileSync(
  join(root, "site/content/docs/(modulators)/lfo.mdx"),
  "utf8",
);

const ARP_README = readFileSync(join(root, "packages/arp/README.md"), "utf8");
const ARP_PAGE = readFileSync(
  join(root, "site/content/docs/(sequencers)/arp.mdx"),
  "utf8",
);

/**
 * The whole markdown table whose header contains `marker`, verbatim.
 *
 * Located by a *column heading* rather than by the header line, because
 * Prettier realigns a table's columns whenever a cell's width changes and two
 * of these tables share their first heading.
 */
function table(source: string, marker: string) {
  const at = source.indexOf(marker);
  if (at === -1) throw Error(`no table with a "${marker}" column`);
  const start = source.lastIndexOf("\n", at) + 1;
  const end = source.indexOf("\n\n", start);
  return source.slice(start, end === -1 ? undefined : end);
}

/** Its body rows, split into trimmed cells. */
function tableRows(source: string, marker: string) {
  return table(source, marker)
    .split("\n")
    .slice(2) // the header and its dashes
    .map((line) =>
      line
        .replace(/^\| | \|$/g, "")
        .split(" | ")
        .map((cell) => cell.trim()),
    );
}

/** `−200 … 200` as written in a Range column, as two numbers. */
function range(cell: string) {
  const [min, max] = cell.replace(/−/g, "-").split("…");
  return [Number(min.trim()), Number(max.trim())];
}

describe("the LFO's parameter table", () => {
  const descriptors = synthlet.Lfo.descriptors as readonly ParamDescriptor[];

  it.each([
    ["packages/lfo/README.md", README],
    ["site/content/docs/(modulators)/lfo.mdx", PAGE],
  ])("in %s names exactly the parameters that exist", (_where, source) => {
    const rows = tableRows(source, "| Default |");
    const named = rows.map(([param]) => param.replace(/`/g, ""));
    expect(named).toEqual(descriptors.map((d) => d.name));
  });

  it.each([
    ["packages/lfo/README.md", README],
    ["site/content/docs/(modulators)/lfo.mdx", PAGE],
  ])("in %s reports the declared range and rate", (_where, source) => {
    for (const [param, , declared, rate] of tableRows(source, "| Default |")) {
      const name = param.replace(/`/g, "");
      const descriptor = descriptors.find((d) => d.name === name)!;
      expect([name, range(declared)]).toEqual([
        name,
        [descriptor.minValue, descriptor.maxValue],
      ]);
      expect([name, rate]).toEqual([name, descriptor.automationRate]);
    }
  });

  it("does not describe `phase` as a parameter", () => {
    // It is a construction option, not an `AudioParam`, and the page says so in
    // its own table - which must therefore not be the parameter one.
    expect(tableRows(PAGE, "| Option ").map(([name]) => name)).toEqual([
      "`phase`",
    ]);
  });
});

describe("the LFO's shape tables", () => {
  it.each([
    ["the deterministic shapes", "| φ=0 "],
    ["the random family", "| Promises "],
  ])("agree between the README and the docs page: %s", (_what, marker) => {
    // `dsp.ts` is the specification and these two are copies of it; the copies
    // at least have to be copies of each other.
    expect(table(PAGE, marker)).toBe(table(README, marker));
  });

  it("lists every LfoType member exactly once", () => {
    const listed = [
      ...tableRows(README, "| φ=0 "),
      ...tableRows(README, "| Promises "),
    ].map(([shape]) => shape.replace(/`|\s*\(\d+\)/g, ""));

    const members = Object.keys(synthlet.LfoType).filter((key) =>
      isNaN(Number(key)),
    );
    expect(listed.sort()).toEqual(members.sort());
  });
});

describe("the arpeggiator's parameter table", () => {
  const descriptors = synthlet.Arp.descriptors as readonly ParamDescriptor[];

  it.each([
    ["packages/arp/README.md", ARP_README],
    ["site/content/docs/(sequencers)/arp.mdx", ARP_PAGE],
  ])("in %s names exactly the parameters that exist", (_where, source) => {
    const rows = tableRows(source, "| Default |");
    const named = rows.map(([param]) => param.replace(/`/g, ""));
    expect(named).toEqual(descriptors.map((d) => d.name));
  });

  it.each([
    ["packages/arp/README.md", ARP_README],
    ["site/content/docs/(sequencers)/arp.mdx", ARP_PAGE],
  ])("in %s reports the declared range and rate", (_where, source) => {
    for (const [param, , declared, rate] of tableRows(source, "| Default |")) {
      const name = param.replace(/`/g, "");
      const descriptor = descriptors.find((d) => d.name === name)!;
      expect([name, range(declared)]).toEqual([
        name,
        [descriptor.minValue, descriptor.maxValue],
      ]);
      expect([name, rate]).toEqual([name, descriptor.automationRate]);
    }
  });

  it.each([
    ["packages/arp/README.md", ARP_README],
    ["site/content/docs/(sequencers)/arp.mdx", ARP_PAGE],
  ])("in %s reports the declared default", (_where, source) => {
    for (const [param, declared] of tableRows(source, "| Default |")) {
      const name = param.replace(/`/g, "");
      const descriptor = descriptors.find((d) => d.name === name)!;
      expect([name, Number(declared)]).toEqual([name, descriptor.defaultValue]);
    }
  });
});

describe("the arpeggiator's mode tables", () => {
  it.each([
    ["the traversals", "| `ArpMode` "],
    ["the octave mappings", "| `ArpOctaveMode` "],
  ])("agree between the README and the docs page: %s", (_what, marker) => {
    expect(table(ARP_PAGE, marker)).toBe(table(ARP_README, marker));
  });

  it.each([
    ["ArpMode", "| `ArpMode` ", () => synthlet.ArpMode],
    ["ArpOctaveMode", "| `ArpOctaveMode` ", () => synthlet.ArpOctaveMode],
  ])("lists every %s member exactly once", (_name, marker, values) => {
    const listed = tableRows(ARP_README, marker).map(([mode]) =>
      mode.replace(/`/g, ""),
    );
    const members = Object.keys(values()).filter((key) => isNaN(Number(key)));
    expect(listed.sort()).toEqual(members.sort());
  });
});

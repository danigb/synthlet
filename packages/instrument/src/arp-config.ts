// The arpeggiator's pattern, as one value.
//
// **Why a value and not four properties on the instrument.** `arp` is a
// reserved preset key, and `presets.ts` insists a preset is complete rather
// than a diff - so the pattern has to round-trip through `getPreset`/
// `setPreset` as one thing. A frozen, defaults-filled config does; a bag of
// four mutable properties does not, and it also cannot be named, stored or
// shared. `synth.arp = CLASSIC` is the spelling that follows.
//
// **Why the mode is a string and not `@synthlet/arp`'s enum.** They are two
// different instruments that happen to share index math:
//
// - `@synthlet/arp` is a worklet whose `mode` is an `AudioParam`. Its enum is
//   correct *there*, and it cannot grow the members this package needs -
//   `params.ts` declares `maxValue: 5`, so an exported `Chord = 6` would be
//   clamped to `RandomOther` silently. That is precisely the failure mode
//   `docs.test.ts` exists to catch: "the example failed by doing nothing".
// - `"Chord"` is not a mode a single-frequency output could ever have, and
//   `order` is not a direction at all - only a *held* set has a press order.
// - A preset is JSON somebody reads. `"UpDownExclusive"` survives a file;
//   `2` does not explain itself.
//
// The two therefore share `_traversal.ts` and nothing else. Because this
// package exports no arp enum, there is no second `ArpMode` in the library and
// no `export *` collision under the umbrella to resolve - which is what
// `arp-enums.test.ts` guards.
//
// `latch` is deliberately not here: it is a performance control, like the
// sustain pedal, and it lives on the instrument as `synth.latch`.

import {
  ArpModeName,
  ArpOctaveModeName,
  ARP_MODE_NAMES,
  ARP_OCTAVE_MODE_NAMES,
  ArpOrder,
  isArpModeName,
} from "./names";

/**
 * An arpeggiator pattern: what to play over the held notes, in what order, and
 * over how many octaves.
 *
 * Frozen, and complete - every field has a value - so it is a value in the
 * ordinary sense: comparable, storable, shareable, and safe to hand to two
 * instruments at once.
 */
export type ArpConfig = Readonly<{
  mode: ArpModeName;
  /** Default `"pitch"`. */
  order: ArpOrder;
  /** 1...4, clamped. Default 1. */
  octaves: number;
  /** Default `"serial"`. */
  octaveMode: ArpOctaveModeName;
}>;

const DEFAULTS: Omit<ArpConfig, "mode"> = {
  order: "pitch",
  octaves: 1,
  octaveMode: "serial",
};

const OPTION_KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

const ORDERS: ArpOrder[] = ["pitch", "played"];

/** 1...4. Four octaves is every surveyed hardware arpeggiator's maximum. */
const MIN_OCTAVES = 1;
const MAX_OCTAVES = 4;

/**
 * A config is a value: name it, store it, share it, put it in a preset.
 *
 * ```ts
 * const CLASSIC = ArpConfig("UpDownExclusive", { octaves: 2 });
 * synth.arp = CLASSIC;
 * ```
 *
 * An unknown mode or an unknown option key throws, naming it and listing the
 * known ones - `presets.ts`'s versioning story. An `octaves` outside 1...4 is
 * **clamped silently**, which is the same file's other rule: a saved value out
 * of range is a stale file, not a mistake.
 *
 * `latch` is deliberately not a field: it is a performance control like the
 * sustain pedal, and it lives on the instrument as `synth.latch`.
 */
export function ArpConfig(
  mode: ArpModeName,
  options: Partial<Omit<ArpConfig, "mode">> = {},
): ArpConfig {
  if (!isArpModeName(mode)) {
    throw Error(
      `Unknown arp mode "${mode}"; known: ${ARP_MODE_NAMES.join(", ")}`,
    );
  }
  for (const key of Object.keys(options)) {
    if (!(OPTION_KEYS as string[]).includes(key)) {
      throw Error(
        `Unknown arp option "${key}"; known: ${OPTION_KEYS.join(", ")}`,
      );
    }
  }

  const order = options.order ?? DEFAULTS.order;
  if (!ORDERS.includes(order)) {
    throw Error(`Unknown arp order "${order}"; known: ${ORDERS.join(", ")}`);
  }

  const octaveMode = options.octaveMode ?? DEFAULTS.octaveMode;
  if (!ARP_OCTAVE_MODE_NAMES.includes(octaveMode)) {
    throw Error(
      `Unknown arp octave mode "${octaveMode}"; known: ` +
        `${ARP_OCTAVE_MODE_NAMES.join(", ")}`,
    );
  }

  // Clamped, silently, and floored: `octaves` is a count, and a fractional one
  // would make `len * octaves` fractional and every index after it a fraction.
  const asked = options.octaves ?? DEFAULTS.octaves;
  const octaves = Math.min(
    MAX_OCTAVES,
    Math.max(MIN_OCTAVES, Math.floor(Number.isFinite(asked) ? asked : 1)),
  );

  return Object.freeze({ mode, order, octaves, octaveMode });
}

/**
 * Anything the `synth.arp` setter accepts, normalised.
 *
 * `null` stays `null` - a plain poly. A complete config is rebuilt rather than
 * trusted, so a hand-written object literal and a value from a JSON preset are
 * validated on exactly the same path as a direct `ArpConfig(...)` call. This
 * is `presets.ts`'s `string | Preset` idiom: one normaliser, one set of rules.
 */
export function toArpConfig(
  value: ArpConfig | Partial<ArpConfig> | null | undefined,
): ArpConfig | null {
  if (value === null || value === undefined) return null;
  const { mode, ...options } = value;
  if (mode === undefined) {
    throw Error(
      `An arp config needs a mode; known: ${ARP_MODE_NAMES.join(", ")}`,
    );
  }
  return ArpConfig(mode, options);
}

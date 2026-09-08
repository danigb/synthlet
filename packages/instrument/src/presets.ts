// A sound by name: the format, the validation, and the writes it becomes.
//
// After the fan-out (`fanout.ts`) every per-instrument parameter is one node
// with an `AudioParam` input, so a preset is **one write per parameter** and
// nothing more. Which means a preset change can be scheduled the same way a
// note can - `setValueAtTime(value, time)` per key is "load the pad at bar 9" -
// and it means this file has no nodes in it at all: `resolvePreset` turns a
// preset into a list of `[key, value]` writes and the instrument applies them.
//
// **Keys, not an array.** rune06's `PresetParams` is a flat struct with
// `to_array`/`from_array` in `ParamId` order, which is what hardware does and
// what the 09-03 research proposed. In JavaScript the object *is* the stable-ID
// mechanism: a key survives reordering, a missing key means "default", and it
// is already JSON - which is also what smplr's `SmplrPreset` is.
//
// **A preset is complete, not a diff.** Every declared parameter is written on
// every load: the ones the preset names with its values, the rest with their
// declared defaults. Loading "Brass 1" after "Pad 3" must not inherit the pad's
// cutoff - a sound that depends on history is exactly what a name is supposed
// to remove, and hardware presets are complete for the same reason. A partial
// write is still available and it is `synth.params.cutoff.value = ...`.
//
// **An unknown key throws.** A definition's `params` keys are its schema, and
// renaming one breaks its presets. That is the versioning story - stated, not
// hidden behind a migration layer nobody has asked for - so the throw names the
// key and lists the known ones. A value *out of range* is a different thing: a
// saved 1.2 on a 0-1 parameter is a stale file, not a mistake, so it is clamped
// silently.

import { NotePriority } from "./_voices";
import { ParamDescriptor } from "./_worklet";
import { ParamSpec } from "./fanout";

/**
 * The instrument options a preset may carry, under keys no definition may use
 * for a parameter of its own.
 *
 * A lead sound *is* its glide, and a bass preset with `priority: Low` is a
 * different instrument from the same voice, so these travel with the sound.
 * They are applied by the allocator, never by the definition - see
 * `03-one-voice-at-a-time`.
 */
export type PresetOptions = {
  /** Seconds. */
  glide?: number;
  legato?: boolean;
  priority?: NotePriority;
};

/** The reserved keys, in the order the rejection message lists them. */
export const RESERVED = ["glide", "legato", "priority"] as const;

export type ReservedKey = (typeof RESERVED)[number];

/**
 * One entry in a definition's bank: the parameters it sets, flat, plus any
 * reserved option.
 *
 * Typed against the definition's own `P`, so a typo in a factory preset is a
 * build error rather than a runtime throw.
 */
export type PresetBankEntry<P extends string> = Partial<Record<P, number>> &
  PresetOptions;

export type PresetBank<P extends string> = Record<string, PresetBankEntry<P>>;

/**
 * A named sound. `params` is param-only; the reserved options sit beside it,
 * because they are not parameters and do not have a fan-out node.
 */
export type Preset<P extends string> = {
  name: string;
  params: Partial<Record<P, number>>;
} & PresetOptions;

/** What a definition has to look like to be read for presets. */
export type PresetSchema<P extends string> = {
  params: Record<P, ParamSpec>;
  presets?: PresetBank<P>;
  /** Used in the error messages. */
  name?: string;
};

/** What the instrument does with a resolved preset: writes, then options. */
export type ResolvedPreset = {
  /** Every declared parameter, in declaration order. */
  writes: [string, number][];
  options: PresetOptions;
};

const label = (schema: { name?: string }) => schema.name ?? "this definition";

const isReserved = (key: string): key is ReservedKey =>
  (RESERVED as readonly string[]).includes(key);

/**
 * Reject a definition whose `params` claims a reserved key.
 *
 * At construction, not at the first `setPreset`: the clash is in the
 * definition, so it is a programming error and the earliest throw is the
 * useful one.
 */
export function assertNoReservedParams<P extends string>(
  schema: PresetSchema<P>,
): void {
  for (const key of Object.keys(schema.params)) {
    if (isReserved(key)) {
      throw Error(
        `"${key}" is a reserved preset key and cannot be a parameter of ` +
          `${label(schema)}; reserved: ${RESERVED.join(", ")}`,
      );
    }
  }
}

/** The names a definition's bank declares, in declaration order. */
export function presetNames<P extends string>(
  schema: PresetSchema<P>,
): string[] {
  return Object.keys(schema.presets ?? {});
}

/**
 * A preset into the writes it becomes.
 *
 * Pure: no context, no nodes, no clock. A name is resolved against the
 * definition's bank (and throws, naming it, when there is no such sound); an
 * object is taken as it is. Every declared parameter appears in `writes`
 * exactly once, clamped to its own range, whether or not the preset named it.
 */
export function resolvePreset<P extends string>(
  schema: PresetSchema<P>,
  preset: string | Preset<P>,
): ResolvedPreset {
  const values: Record<string, number> = {};
  const options: PresetOptions = {};

  const collect = (source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      if (isReserved(key)) {
        (options as Record<string, unknown>)[key] = value;
      } else if (key in schema.params) {
        values[key] = value as number;
      } else {
        throw Error(
          `Unknown parameter "${key}" for ${label(schema)}; known: ` +
            `${Object.keys(schema.params).join(", ")}`,
        );
      }
    }
  };

  if (typeof preset === "string") {
    const bank = schema.presets ?? {};
    if (!(preset in bank)) {
      const known = Object.keys(bank);
      throw Error(
        `Unknown preset "${preset}" for ${label(schema)}; known: ` +
          `${known.length ? known.join(", ") : "(none)"}`,
      );
    }
    collect(bank[preset] as Record<string, unknown>);
  } else {
    collect(preset.params as Record<string, unknown>);
    // The reserved options live beside `params` on a `Preset` object, which is
    // also where `getPreset` puts them, so a round-trip keeps them.
    for (const key of RESERVED) {
      const value = (preset as Record<string, unknown>)[key];
      if (value !== undefined)
        (options as Record<string, unknown>)[key] = value;
    }
  }

  const writes: [string, number][] = [];
  for (const [key, spec] of Object.entries(schema.params) as [
    string,
    ParamSpec,
  ][]) {
    const value = key in values ? values[key] : spec.default;
    // Clamped, silently: a saved value outside the range is a stale file, not
    // an error, and the range is what the parameter can actually do.
    writes.push([key, Math.min(spec.max, Math.max(spec.min, value))]);
  }

  return { writes, options };
}

/**
 * A `ParamSpec` from a module's own `descriptors`, so a definition that passes
 * an inlet straight through to a worklet retypes nothing:
 *
 * ```ts
 * params: { attack: fromDescriptor(AdsrAmp, "attack", { default: 0.01 }) }
 * ```
 *
 * It takes anything with `descriptors` rather than a module, so this package
 * still depends on nothing.
 */
export function fromDescriptor(
  module: { descriptors: readonly ParamDescriptor[] },
  name: string,
  overrides: Partial<ParamSpec> = {},
): ParamSpec {
  const descriptor = module.descriptors.find((d) => d.name === name);
  if (!descriptor) {
    throw Error(
      `No parameter "${name}" in the descriptors; known: ` +
        `${module.descriptors.map((d) => d.name).join(", ")}`,
    );
  }
  return {
    default: descriptor.defaultValue,
    min: descriptor.minValue,
    max: descriptor.maxValue,
    ...overrides,
  };
}

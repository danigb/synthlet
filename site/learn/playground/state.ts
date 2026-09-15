/*
 * A patch you can send someone, in the URL.
 *
 * The site is a static export: no server, no database, nowhere to put a saved
 * sound. So the sound *is* the link. Everything the Playground needs to rebuild
 * what you were hearing goes into the fragment, which browsers never send
 * anywhere and which `history.replaceState` can rewrite on every knob move
 * without navigating.
 *
 * It lives here, outside `app/`, because two pages write it and one reads it:
 * the lesson chrome builds a link to the Playground ("Open in Playground" with
 * the lesson's preset), the Playground rewrites it as the reader plays, and the
 * Playground parses it on load. One format, one file - the alternative is two
 * encoders that agree until they do not.
 *
 * The shape is deliberately small: a preset name, the parameters that differ
 * from it, where the pad is, how many voices, how much glide. Anything that can
 * be derived is not in it.
 */

export interface PlaygroundState {
  /** A preset name from either bank of `learn/voice`. */
  preset?: string;
  /** Only the parameters that differ from the preset. */
  params?: Record<string, number>;
  /** Where the XY pad is, 0…1 on each axis. */
  xy?: [number, number];
  /** How many voices the instrument was built with. */
  voices?: number;
  /** Portamento, in seconds. */
  glide?: number;
}

/** The Playground's route. */
export const PLAYGROUND_PATH = "/learn/playground";

/**
 * How large the voice pool may be.
 *
 * A link is user input, so a `voices: 400` in one is a request to build four
 * hundred voices' worth of worklets from a string somebody typed. The Playground
 * patch declares the same range on its own control and
 * `learn/playground/playground.test.ts` keeps the two numbers equal.
 */
export const VOICE_RANGE = { min: 1, max: 8 };

/** How much glide a link may ask for. The control's range, and the patch's. */
const GLIDE_MAX = 1;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** The fragment's one key, so that a future second one can be added beside it. */
const KEY = "p";

/**
 * base64url, so the fragment survives being pasted into anything.
 *
 * `btoa` only speaks Latin-1, so the JSON goes through `TextEncoder` first and
 * the bytes are handed over one character at a time. Both `btoa` and
 * `TextEncoder` are in Node 18 and in every browser this site supports, which
 * is what lets one implementation serve the build, the tests and the page.
 */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The parts of a decoded object that are the shape this version understands.
 *
 * A link is user input - it has been pasted, truncated, hand-edited and written
 * by a version of this page that no longer exists - so every field is checked
 * on the way in and anything unrecognised is dropped rather than handed to the
 * synth.
 */
function clean(value: unknown): PlaygroundState {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const state: PlaygroundState = {};

  if (typeof raw.preset === "string") state.preset = raw.preset;

  if (typeof raw.params === "object" && raw.params !== null) {
    const params: Record<string, number> = {};
    for (const [name, amount] of Object.entries(raw.params)) {
      if (isFiniteNumber(amount)) params[name] = amount;
    }
    if (Object.keys(params).length > 0) state.params = params;
  }

  if (
    Array.isArray(raw.xy) &&
    raw.xy.length === 2 &&
    raw.xy.every(isFiniteNumber)
  ) {
    // A pad position is a fraction of the pad. Anything else is a link that has
    // been hand-edited, and the corner is the nearest true answer to it.
    state.xy = [clamp(raw.xy[0], 0, 1), clamp(raw.xy[1], 0, 1)];
  }

  // The two that cost something. A pool is worklets and a glide is a ramp, and
  // both of them come out of a string somebody could have typed.
  if (isFiniteNumber(raw.voices)) {
    state.voices = Math.round(
      clamp(raw.voices, VOICE_RANGE.min, VOICE_RANGE.max),
    );
  }
  if (isFiniteNumber(raw.glide)) state.glide = clamp(raw.glide, 0, GLIDE_MAX);

  return state;
}

/**
 * The parameters that differ from the sound the link already names.
 *
 * A preset is complete - it writes all thirty-one - so a link that repeated
 * every one of them would be four hundred characters saying what its own first
 * field already said. Only the departures travel, which is also what makes a
 * link readable when the reader has moved two knobs.
 *
 * The tolerance is there because a value that went out through JSON and came
 * back is not always the bit pattern it left as, and a parameter that was never
 * touched must not reappear as "changed" on every reload.
 */
export function changedParams(
  values: Record<string, number>,
  base: Record<string, number>,
): Record<string, number> {
  const changed: Record<string, number> = {};

  for (const [name, value] of Object.entries(values)) {
    const was = base[name];
    if (was === undefined) {
      changed[name] = value;
      continue;
    }
    // Relative, because these span 0…1 and −10000…10000 in the same table.
    const tolerance = Math.max(Math.abs(was), 1) * 1e-9;
    if (Math.abs(value - was) > tolerance) changed[name] = value;
  }

  return changed;
}

/** Whether there is anything worth putting in a link. */
function isEmpty(state: PlaygroundState): boolean {
  return Object.keys(clean(state)).length === 0;
}

/**
 * `p=<base64url JSON>`, without the `#`.
 *
 * An empty state encodes to an empty string, so that a Playground at its
 * defaults has a clean URL rather than a fragment that says nothing.
 */
export function encodePlaygroundState(state: PlaygroundState): string {
  if (isEmpty(state)) return "";
  return `${KEY}=${toBase64Url(JSON.stringify(clean(state)))}`;
}

/**
 * The state in a fragment, with or without its `#`.
 *
 * Never throws. A fragment that is not ours, not base64, not JSON or not an
 * object is an empty state, because the Playground opening at its defaults is
 * the right answer to a link somebody broke.
 */
export function decodePlaygroundState(hash: string): PlaygroundState {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const encoded = new URLSearchParams(fragment).get(KEY);
  if (!encoded) return {};

  try {
    return clean(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return {};
  }
}

/** The link a lesson's "Open in Playground" points at. */
export function playgroundHref(state: PlaygroundState): string {
  const fragment = encodePlaygroundState(state);
  return fragment ? `${PLAYGROUND_PATH}#${fragment}` : PLAYGROUND_PATH;
}

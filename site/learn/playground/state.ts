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

/** The Playground's route. It does not exist until learning-synthlet 06. */
export const PLAYGROUND_PATH = "/learn/playground";

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
    state.xy = [raw.xy[0], raw.xy[1]];
  }

  if (isFiniteNumber(raw.voices)) state.voices = raw.voices;
  if (isFiniteNumber(raw.glide)) state.glide = raw.glide;

  return state;
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

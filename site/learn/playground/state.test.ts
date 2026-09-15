import { describe, expect, it } from "vitest";
import {
  decodePlaygroundState,
  encodePlaygroundState,
  playgroundHref,
  type PlaygroundState,
} from "./state";

/*
 * The link is the only place a sound is ever saved, so the two halves of this
 * format have to agree forever, and the decoding half has to survive whatever
 * a URL has been through on the way here.
 */

describe("encode and decode", () => {
  it("round-trips everything the Playground carries", () => {
    const state: PlaygroundState = {
      preset: "wow-bass",
      params: { cutoff: 880, resonance: 0.72 },
      xy: [0.25, 0.5],
      voices: 8,
      glide: 0.08,
    };

    expect(decodePlaygroundState(`#${encodePlaygroundState(state)}`)).toEqual(
      state,
    );
  });

  it("encodes a default Playground to nothing at all", () => {
    expect(encodePlaygroundState({})).toBe("");
    expect(playgroundHref({})).toBe("/learn/playground");
  });

  it("is url-safe", () => {
    // Every byte of a long float lands in the payload; `+`, `/` and `=` would
    // all survive a paste into markdown or a chat window differently.
    const encoded = encodePlaygroundState({
      preset: "two-sounds-in-one",
      params: { cutoff: 1234.56789, lfoRate: 0.333333, pulseWidth: 0.987654 },
    });

    expect(encoded).toMatch(/^p=[A-Za-z0-9_-]+$/);
  });

  it("decodes with or without the hash", () => {
    const encoded = encodePlaygroundState({ preset: "bass" });
    expect(decodePlaygroundState(encoded)).toEqual({ preset: "bass" });
    expect(decodePlaygroundState(`#${encoded}`)).toEqual({ preset: "bass" });
  });
});

describe("a link somebody broke", () => {
  it.each([
    ["nothing", ""],
    ["only a hash", "#"],
    ["somebody else's fragment", "#section-2"],
    ["our key, with rubbish in it", "#p=not-base64-at-all!!"],
    ["our key, truncated", "#p=eyJwcmVzZXQiOiJ3"],
    ["valid base64 that is not json", `#p=${btoa("hello")}`],
    ["json that is not an object", `#p=${btoa("[1,2,3]")}`],
  ])("decodes %s to an empty state", (_what, hash) => {
    expect(decodePlaygroundState(hash)).toEqual({});
  });

  it("drops fields of the wrong shape rather than passing them on", () => {
    const hash = `#p=${btoa(
      JSON.stringify({
        preset: 7,
        params: { cutoff: "loud", resonance: 0.5 },
        xy: [0.5],
        voices: "many",
        glide: 0.1,
        somethingLater: { a: 1 },
      }),
    )}`;

    expect(decodePlaygroundState(hash)).toEqual({
      params: { resonance: 0.5 },
      glide: 0.1,
    });
  });
});

describe("playgroundHref", () => {
  it("is the route plus the fragment", () => {
    expect(playgroundHref({ preset: "envelope-organ" })).toBe(
      `/learn/playground#${encodePlaygroundState({ preset: "envelope-organ" })}`,
    );
  });
});

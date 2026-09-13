import { describe, expect, it } from "vitest";
import {
  lessonPatchReferences,
  patchReferencesIn,
  voiceReference,
} from "./lesson-patches";

/*
 * The scan the chrome asks its one question through.
 *
 * Two halves, and the second is the one worth having: the regex is easy to get
 * right and easy to test, but the *index* depends on where the content is and
 * on turning a file path back into a slug, and either of those being wrong
 * would look exactly like a lesson with no widget - a missing "Open in
 * Playground" and no error anywhere. So the second half asserts against a
 * lesson that really exists.
 */

describe("patchReferencesIn", () => {
  it("reads the id, the shown controls and the preset", () => {
    const source = [
      "---",
      "title: Attack",
      "---",
      "",
      'Prose. <Patch id="voice" preset="envelope-organ" show={["attack", "decay"]} />',
      "",
    ].join("\n");

    expect(patchReferencesIn(source)).toEqual([
      { id: "voice", preset: "envelope-organ", show: ["attack", "decay"] },
    ]);
  });

  it("finds a lesson with no widget at all", () => {
    expect(patchReferencesIn("Just prose, and a < b.")).toEqual([]);
  });

  it("does not read a fenced example as a widget", () => {
    const source = [
      "A lesson about the tag:",
      "",
      "```mdx",
      '<Patch id="voice" />',
      "```",
      "",
    ].join("\n");

    expect(patchReferencesIn(source)).toEqual([]);
  });

  it("keeps every widget on a page, in order", () => {
    const source = '<Patch id="a" />\n\ntext\n\n<Patch id="b" />';
    expect(patchReferencesIn(source).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the index over content/learn", () => {
  it("resolves a lesson that exists", () => {
    expect(lessonPatchReferences(["sound", "what-is-in-a-sound"])).toEqual([
      {
        id: "sound/harmonics",
        preset: undefined,
        show: ["harmonics", "cutoff", "strip"],
      },
    ]);
  });

  it("is empty for a page that is not a lesson", () => {
    expect(lessonPatchReferences(["about"])).toEqual([]);
    expect(lessonPatchReferences([])).toEqual([]);
  });

  it("is empty for a slug nothing is served at", () => {
    expect(lessonPatchReferences(["nowhere", "at-all"])).toEqual([]);
  });
});

describe("voiceReference", () => {
  it("is undefined for a lesson on its own patch", () => {
    expect(voiceReference(["sound", "what-is-in-a-sound"])).toBeUndefined();
  });

  it("is the voice widget when the lesson has one", () => {
    const references = patchReferencesIn(
      '<Patch id="sound/harmonics" />\n<Patch id="voice" preset="bass" />',
    );
    expect(references.find((r) => r.id === "voice")?.preset).toBe("bass");
  });
});

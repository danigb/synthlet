import * as instrument from "@synthlet/instrument";
import * as synthlet from "./index";

/**
 * The umbrella's re-exports, checked by identity rather than by name.
 *
 * `export *` and an explicit `export { X }` from the same module are the same
 * binding, so an enum named twice here is still one object - but a name
 * exported by *two* packages silently becomes whichever one wins, and a
 * narrowed re-export silently drops what it does not list. Both failures are
 * invisible to `tsc` and to every other test in the repo, because nothing
 * breaks: the name is simply gone, or is the wrong thing.
 *
 * `StealMode` and `NotePriority` are named explicitly in `index.ts` for a
 * different reason, which the file documents: tsup's dts bundler drops enums
 * from an `export *`, so without the explicit line they exist at runtime and
 * not in the published types.
 */
describe("the umbrella re-exports @synthlet/instrument", () => {
  it("exports the instrument, its definition helpers and the voice", () => {
    expect(typeof synthlet.Instrument).toBe("function");
    expect(typeof synthlet.fromDescriptor).toBe("function");
    expect(typeof synthlet.toMidi).toBe("function");
    expect(typeof synthlet.monoVoice).toBe("object");
  });

  it.each(["StealMode", "NotePriority"] as const)(
    "exports %s exactly once - the package's own object",
    (name) => {
      expect(synthlet[name]).toBe(instrument[name]);
      // A copy would compare equal member by member and still be a second
      // enum, so the identity above is the assertion; this is the message
      // when it fails.
      expect(Object.entries(synthlet[name])).toEqual(
        Object.entries(instrument[name]),
      );
    },
  );

  it("leaves nothing behind", () => {
    for (const name of Object.keys(instrument)) {
      expect([name, synthlet[name as keyof typeof synthlet]]).toEqual([
        name,
        instrument[name as keyof typeof instrument],
      ]);
    }
  });
});

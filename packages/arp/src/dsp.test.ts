import { createArpeggiator } from "./dsp";

// The arpeggiator advances on the rising edge of its trigger. It picks a
// random note, so what is asserted is *that* it advanced, over enough tries
// that picking the same note twice cannot mask a missed advance.
describe("createArpeggiator trigger detection", () => {
  const CHROMATIC = 4095;
  const advances = (triggers: number[]) => {
    const arp = createArpeggiator();
    const notes = triggers.map((trigger) => arp(trigger, 60, CHROMATIC, 4));
    return notes;
  };

  const changed = (notes: number[]) =>
    notes.some((note, i) => i > 0 && note !== notes[i - 1]);

  it.each([1, 0.99, 0.5, 0.05])("advances on a trigger of %p", (trigger) => {
    // Alternating with 0 gives one rising edge per pair.
    const notes = advances([0, ...new Array(40).fill([trigger, 0]).flat()]);
    expect(changed(notes)).toBe(true);
  });

  it.each([0, -1])("does not advance on a trigger of %p", (trigger) => {
    expect(changed(advances(new Array(40).fill(trigger)))).toBe(false);
  });

  it("advances once while the trigger is held", () => {
    const arp = createArpeggiator();
    arp(0, 60, CHROMATIC, 4);
    const fired = arp(1, 60, CHROMATIC, 4);
    for (let i = 0; i < 40; i++) {
      expect(arp(1, 60, CHROMATIC, 4)).toBe(fired);
    }
  });
});

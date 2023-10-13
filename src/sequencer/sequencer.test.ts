import { sequence } from "./events";
import { Sequencer } from "./sequencer";

export function fill(sequencer: Sequencer, count: number) {
  const output = new Float32Array(5);
  sequencer.fillControl(output);
  return Array.from(output);
}

describe("Sequencer", () => {
  it("plays a sequence", () => {
    const sq = Sequencer(10);
    sq.setParams({ bpm: [60] });
    sq.setSequence(
      sequence([
        [10, 1],
        [20, 2],
        [30, 1],
      ])
    );
    expect(fill(sq, 5)).toEqual([10, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([20, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([30, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(fill(sq, 5)).toEqual([10, 0, 0, 0, 0]);
    sq.setParams({ bpm: [85] });
    // This is conceptually incorrect, but it works because sampleRate is usually much higher
    expect(fill(sq, 5)).toEqual([20, 0, 0, 0, 0]);
  });
});

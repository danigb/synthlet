import { Trigger } from "./trigger";

describe("Trigger", () => {
  it("detects gate on", () => {
    const detect = new Trigger();
    expect(detect.process(0)).toBe(false);
    expect(detect.process(1)).toBe(true);
    expect(detect.process(1)).toBe(false);
    expect(detect.process(0)).toBe(false);
    expect(detect.process(1)).toBe(true);
    expect(detect.process(1)).toBe(false);
    expect(detect.process(0)).toBe(false);
  });
});

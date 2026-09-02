import { createGateDetector, gatePulse } from "./_gate";

// The contract every trigger-consuming package shares: the gate is on while
// the signal is positive, and a trigger is the transition from non-positive to
// positive. This file is the one place it is asserted; the drift test in
// @synthlet/synthlet keeps the per-package copies identical.
describe("createGateDetector", () => {
  it("fires on any positive value, not just 1", () => {
    for (const value of [1, 0.99, 0.5, 0.05, 1e-6, 1000]) {
      expect(createGateDetector()(value)).toBe(true);
    }
  });

  it("does not fire on zero or a negative value", () => {
    for (const value of [0, -0, -1e-6, -1, -1000]) {
      expect(createGateDetector()(value)).toBeUndefined();
    }
  });

  it("fires once while the signal is held positive", () => {
    const detect = createGateDetector();
    expect(detect(1)).toBe(true);
    expect(detect(1)).toBeUndefined();
    expect(detect(0.5)).toBeUndefined();
    expect(detect(2)).toBeUndefined();
  });

  it("closes on the falling edge and fires again after it", () => {
    const detect = createGateDetector();
    expect(detect(1)).toBe(true);
    expect(detect(0)).toBe(false);
    expect(detect(0)).toBeUndefined();
    expect(detect(0.25)).toBe(true);
  });

  it("closes at exactly zero, so a gate that returns to 0 releases", () => {
    const detect = createGateDetector();
    detect(1);
    expect(detect(0)).toBe(false);
  });

  it("reads a bipolar square as a 50% duty gate", () => {
    // Every LfoType is +/-1, so a square becomes a gate for free - how a
    // comparator at 0 V behaves in modular.
    const detect = createGateDetector();
    const square = [1, 1, -1, -1, 1, 1, -1, -1];
    const edges = square.map((v) => detect(v));
    expect(edges).toEqual([
      true,
      undefined,
      false,
      undefined,
      true,
      undefined,
      false,
      undefined,
    ]);
  });

  it("is transparent to Param's input * gain + offset", () => {
    // The reason the rule needs no threshold: attenuating a gate line cannot
    // silently stop it working.
    const detect = createGateDetector();
    expect(detect(1 * 0.5 + 0)).toBe(true);
    expect(detect(0 * 0.5 + 0)).toBe(false);
  });
});

describe("gatePulse", () => {
  it("is high for the first `width` of the phase", () => {
    expect(gatePulse(0, 0.5)).toBe(1);
    expect(gatePulse(0.49, 0.5)).toBe(1);
    expect(gatePulse(0.5, 0.5)).toBe(0);
    expect(gatePulse(0.99, 0.5)).toBe(0);
  });

  it("is never high at width 0 and always high at width 1", () => {
    expect(gatePulse(0, 0)).toBe(0);
    expect(gatePulse(0.999, 1)).toBe(1);
  });
});

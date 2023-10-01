import { Timer } from "./timer";

describe("Timer", () => {
  let timer: Timer;

  beforeEach(() => {
    timer = new Timer();
  });

  it("should initialize with a tick count of 0", () => {
    expect(timer.getTick()).toBe(0);
  });

  it("should reset the tick count to 0", () => {
    timer.advanceTimer(10);
    timer.resetTimer();
    expect(timer.getTick()).toBe(0);
  });

  it("should set the target value in samples", () => {
    timer.setExpireSamples(100);
    expect(timer.getExpireSamples()).toBe(100);
  });

  it("should set the target value in milliseconds", () => {
    timer.setExpireMilliSec(1000, 44100);
    expect(timer.getExpireSamples()).toBe(44100);
  });

  it("should return true when the timer has expired", () => {
    timer.setExpireSamples(10);
    timer.advanceTimer(10);
    expect(timer.timerExpired()).toBe(true);
  });

  it("should return false when the timer has not expired", () => {
    timer.setExpireSamples(10);
    timer.advanceTimer(5);
    expect(timer.timerExpired()).toBe(false);
  });

  it("should advance the timer by the specified number of ticks", () => {
    timer.advanceTimer(10);
    expect(timer.getTick()).toBe(10);
  });
});

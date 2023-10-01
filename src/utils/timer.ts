/**
 * 	Ultra compact timer object that is used for many different functionalities
 * - Set the timer to expire after some number of milliseconds OR some number of sample intervals
 * - functions to advance the timer and the timer tick count
 * - use timerExpired( ) to query the timer's expiration state: true = expired

 * @author Will Pirkle http://www.willpirkle.com
 */
export class Timer {
  private counter: number = 0;
  private targetValueInSamples: number = 0;

  resetTimer(): void {
    this.counter = 0;
  }

  setExpireSamples(targetValueInSamples: number): void {
    this.targetValueInSamples = targetValueInSamples;
  }

  setExpireMilliSec(timeMSec: number, sampleRate: number): void {
    this.setExpireSamples(Math.floor(sampleRate * (timeMSec / 1000)));
  }

  getExpireSamples(): number {
    return this.targetValueInSamples;
  }

  timerExpired(): boolean {
    return this.counter >= this.targetValueInSamples;
  }

  advanceTimer(ticks: number = 1): void {
    this.counter += ticks;
  }

  getTick(): number {
    return this.counter;
  }
}

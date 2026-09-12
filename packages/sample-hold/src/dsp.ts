/**
 * A sample and hold is two lines, and they are in `worklet.ts`. What lives
 * here is the one thing a caller has to name: which of the two latches is
 * wired to the trigger.
 */
export enum SampleHoldType {
  /**
   * Latch on the **rising** edge and hold until the next one. The module Part
   * 16 opens with, and the switch closing in its Figure 1.
   */
  SampleHold = 0,
  /**
   * Transparent while the trigger is positive; latch on the **falling** edge.
   * The Korg MS20 and the Buchla 264 - *"you can use the duty cycle of your
   * clock pulse to determine the proportion of time that the output tracks the
   * input"*. A trigger of minimal width makes it a plain S&H, which the book
   * also says.
   */
  Track = 1,
}

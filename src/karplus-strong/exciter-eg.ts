import { Timer } from "./timer";

enum EGState {
  kOff = 0,
  kAttack = 1,
  kHold = 2,
  kRelease = 3,
}

/**
 * Special purpose EG just for the Karplus Strong exciter.
 * - does not use a base class or interface
 * - custom designed for use with KS algorithm
 */
export class ExciterEG {
  attackTime_mSec = -1.0; ///< att: is a time duration
  releaseTime_mSec = -1.0; ///< rel: is a time to decay from max output to 0.0
  holdTime_mSec = -1.0; ///< rel: is a time to decay from max output to 0.0
  attackCoeff = 0.0; ///< see AnalogEG
  attackOffset = 0.0; ///< see AnalogEG
  attackTCO = 0.0; ///< see AnalogEG
  releaseCoeff = 0.0; ///< see AnalogEG
  releaseOffset = 0.0; ///< see AnalogEG
  releaseTCO = 0.0; ///< see AnalogEG
  sampleRate = 0.0; ///< sample rate
  envelopeOutput = 0.0; ///< the current envelope output sample
  state = EGState.kOff; ///< EG state variable
  holdTimer = new Timer(); ///< holding timer
  noteOn = false; ///< run/stop flag

  reset(sampleRate: number): boolean {
    this.sampleRate = sampleRate;
    this.holdTimer.resetTimer();

    // --- analog time constants
    this.attackTCO = Math.exp(-1.5);
    this.releaseTCO = Math.exp(-4.95);

    // --- recalc these, SR dependent
    this.calcAttackCoeff(this.attackTime_mSec);
    this.calcReleaseCoeff(this.releaseTime_mSec);

    // --- reset the state
    this.envelopeOutput = 0.0;
    this.state = EGState.kOff;

    return true;
  }

  render(): number {
    // --- decode the state
    switch (this.state) {
      case EGState.kOff: {
        // --- output is OFF
        this.envelopeOutput = 0.0;
        break;
      }
      case EGState.kAttack: {
        // --- render value
        this.envelopeOutput =
          this.attackOffset + this.envelopeOutput * this.attackCoeff;

        // --- check go to next state
        if (this.envelopeOutput >= 1.0 || this.attackTime_mSec <= 0.0) {
          this.envelopeOutput = 1.0;
          if (this.holdTime_mSec > 0.0)
            this.state = EGState.kHold; // go to HOLD
          else this.state = EGState.kRelease; // go to relase

          break;
        }
        break;
      }
      case EGState.kHold: {
        this.envelopeOutput = 1.0; // --- hold value

        this.holdTimer.advanceTimer();
        if (this.holdTimer.timerExpired()) this.state = EGState.kRelease; // go to relase

        break;
      }
      case EGState.kRelease: {
        // --- render value
        this.envelopeOutput =
          this.releaseOffset + this.envelopeOutput * this.releaseCoeff;

        // --- check go to next state
        if (this.envelopeOutput <= 0.0 || this.releaseTime_mSec <= 0.0) {
          this.envelopeOutput = 0.0;
          this.state = EGState.kOff; // go to OFF state
          break;
        }
        break;
      }
    }
    return this.envelopeOutput;
  }

  ///< start the FSM
  startEG(): boolean {
    // --- reset the state
    this.envelopeOutput = 0.0;
    this.state = EGState.kAttack;
    this.holdTimer.resetTimer();

    return true;
  }

  ///< param setter
  setParameters(
    _attackTime_mSec: number,
    _holdTime_mSec: number,
    _releaseTime_mSec: number
  ): void {
    if (this.attackTime_mSec != _attackTime_mSec)
      this.calcAttackCoeff(_attackTime_mSec);

    if (this.releaseTime_mSec != _releaseTime_mSec)
      this.calcReleaseCoeff(_releaseTime_mSec);

    if (this.holdTime_mSec != _holdTime_mSec) {
      this.holdTimer.setExpireMilliSec(_holdTime_mSec, sampleRate);
      this.holdTime_mSec = _holdTime_mSec;
    }
  }

  calcAttackCoeff(attackTime: number, attackTimeScalar = 1): void {
    // --- store for comparing so don't need to waste cycles on updates
    this.attackTime_mSec = attackTime;

    // --- samples for the exponential rate
    const samples =
      this.sampleRate * ((this.attackTime_mSec * attackTimeScalar) / 1000.0);

    // --- coeff and base for iterative exponential calculation
    this.attackCoeff = Math.exp(
      -Math.log((1.0 + this.attackTCO) / this.attackTCO) / samples
    );
    this.attackOffset = (1.0 + this.attackTCO) * (1.0 - this.attackCoeff);
  }

  calcReleaseCoeff(releaseTime: number, releaseTimeScalar = 1): void {
    // store for comparing so don't need to waste cycles on updates
    this.releaseTime_mSec = releaseTime;

    // samples for the exponential rate
    const samples =
      this.sampleRate * ((this.releaseTime_mSec * releaseTimeScalar) / 1000.0);

    // coeff and base for iterative exponential calculation
    this.releaseCoeff = Math.exp(
      -Math.log((1.0 + this.releaseTCO) / this.releaseTCO) / samples
    );
    this.releaseOffset = -this.releaseTCO * (1.0 - this.releaseCoeff);
  }
}

export function createChorus(sampleRate: number) {
  const dc1L = DcBlocker();
  const dc1R = DcBlocker();
  const dc2L = DcBlocker();
  const dc2R = DcBlocker();

  let _lfoRate1 = 0.5;
  let _lfoRate2 = 0.83;
  let delayTimeMs = 7.0;
  const ch1L = Chorus(sampleRate, 1.0, _lfoRate1, delayTimeMs);
  const ch1R = Chorus(sampleRate, 0.0, _lfoRate1, delayTimeMs);
  const ch2L = Chorus(sampleRate, 0.0, _lfoRate2, delayTimeMs);
  const ch2R = Chorus(sampleRate, 1.0, _lfoRate2, delayTimeMs);

  let isChorus1Enabled = true;
  let isChorus2Enabled = true;

  return {
    update(
      enable1: number,
      enable2: number,
      lfoRate1: number,
      lfoRate2: number
    ) {
      isChorus1Enabled = enable1 === 1;
      isChorus2Enabled = enable2 === 1;
      if (lfoRate1 !== _lfoRate1) {
        console.log("lfoRate1", lfoRate1);
        _lfoRate1 = lfoRate1;
        ch1L.setLfoRate(lfoRate1);
        ch1R.setLfoRate(lfoRate1);
      }
      if (lfoRate2 !== _lfoRate2) {
        console.log("lfoRate1", lfoRate1);
        _lfoRate2 = lfoRate2;
        ch2L.setLfoRate(lfoRate2);
        ch2R.setLfoRate(lfoRate2);
      }
    },

    process(inputs: Float32Array[], outputs: Float32Array[]) {
      const left = inputs[0];
      const right = inputs.length > 1 ? inputs[1] : left;
      for (let i = 0; i < left.length; i++) {
        const inL = left[i];
        const inR = right[i];
        let l = inL;
        let r = inR;
        if (isChorus1Enabled) {
          l = dc1L.process(ch1L.process(l));
          r = dc1R.process(ch1R.process(r));
        }
        if (isChorus2Enabled) {
          l = dc2L.process(ch2L.process(l));
          r = dc2R.process(ch2R.process(r));
        }
        outputs[0][i] = inL + 1.4 * l;
        outputs[1][i] = inR + 1.4 * r;
      }
    },
  };
}

function DcBlocker() {
  let prevInput = 0;
  let prevOutput = 0;

  const cutoff = 0.01; // About  10Hz at 48kHz
  const alpha = 0.999 - cutoff * 0.4;

  return {
    process(input: number): number {
      const out = input - prevInput + alpha * prevOutput;
      prevInput = input;
      prevOutput = out;
      return out;
    },
  };
}

function OnePoleLP(cutoff: number = 0.99) {
  const f = cutoff * 0.98;
  const alpha = f * f * f * f;
  let prevOut = 0;

  // Denormal fix (very small amount)
  const VSA = 1.0 / 4294967295.0;

  return {
    tick(input: number) {
      const out = 1 - alpha * input + alpha * prevOut + VSA;
      prevOut = out;
      return out;
    },
  };
}

function Chorus(
  sampleRate: number,
  phase: number,
  rate: number,
  delayTimeMs: number
) {
  let z1 = 0;
  let sign = 0;
  let lfoPhase = phase * 2 - 1;
  let lfoStepSize = (4 * rate) / sampleRate;
  let lfoSign = 1;

  const delayTimeSamples = Math.floor(sampleRate * delayTimeMs * 0.001) + 1;
  const delayLineLength = delayTimeSamples + 2000;
  const delayLine = new Float32Array(delayLineLength).fill(0);
  // End of the delay line so first read is always 0
  let writeIndex = delayLineLength - 1;
  let delayLineOutput = 0;
  const lpf = OnePoleLP(0.99);

  function nextLfo() {
    if (lfoPhase >= 1) lfoSign = -1;
    if (lfoPhase <= -1) lfoSign = 1;
    lfoPhase += lfoSign * lfoStepSize;
    return lfoPhase;
  }

  return {
    setLfoRate(rate: number) {
      lfoStepSize = (4 * rate) / sampleRate;
    },

    process(input: number): number {
      input = input * 0.2;
      const offset = (0.3 * nextLfo() + 0.4) * delayTimeSamples;

      let readIndex1 = writeIndex - Math.floor(offset);
      if (readIndex1 < 0) readIndex1 += delayLineLength;

      let readIndex2 = readIndex1 - 1;
      if (readIndex2 < 0) readIndex2 += delayLineLength;

      const frac = offset - Math.floor(offset);
      delayLineOutput =
        delayLine[readIndex2] +
        delayLine[readIndex1] * (1 - frac) -
        (1 - frac) * z1;
      z1 = delayLineOutput;
      delayLineOutput = lpf.tick(delayLineOutput);

      delayLine[writeIndex] = input;

      writeIndex++;
      if (writeIndex >= delayLineLength) writeIndex = 0;

      return delayLineOutput;
    },
  };
}

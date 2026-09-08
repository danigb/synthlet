class LevelMeterProcessor extends AudioWorkletProcessor {
  peaks: Float32Array;
  max: number;
  r: boolean;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const peaksBuffer = options.processorOptions.peaksBuffer;
    this.peaks = new Float32Array(peaksBuffer);
    this.max = 8;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    let channels = Math.min(input.length, this.max);

    for (let channel = 0; channel < channels; channel++) {
      const chIn = input[channel];
      const chOut = output[channel];
      let peak = 0;
      for (let i = 0; i < chIn.length; i++) {
        peak = Math.max(peak, Math.abs(chIn[i]));
      }
      this.peaks[channel] = this.peaks[channel] * 0.9 + peak * 0.1;
      chOut.set(chIn);
    }
    return this.r;
  }

  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor("LevelMeterProcessor", LevelMeterProcessor);

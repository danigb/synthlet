class LevelMeterProcessor extends AudioWorkletProcessor {
  data: Float32Array;
  max: number;
  r: boolean;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const sharedBuffer = options.processorOptions.sharedBuffer;
    this.data = new Float32Array(sharedBuffer);
    this.max = this.data.length;
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
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length || input.length !== output.length) return true;

    let channels = Math.min(input.length, this.max);

    for (let channel = 0; channel < channels; channel++) {
      const channelData = input[channel];
      for (let i = 0; i < channelData.length; i++) {
        this.data[i] = Math.max(this.data[i], Math.abs(channelData[i]));
      }
    }
    return true;
  }

  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor("LevelMeterProcessor", LevelMeterProcessor);

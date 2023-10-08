import { ParamsDef } from "../worklet-utils";

export const PcmOscillatorParams: ParamsDef = {
  gate: { min: 0, max: 1, def: 0 },
  speed: { min: -100, max: 100, def: 1 },
} as const;

export function PcmOscillator(sampleRate: number) {
  let _gate = 0;
  let buffer: Float32Array | null = null;
  let index = 0;
  let _speed = 1;

  function setParams(gate: number, speed: number) {
    if (buffer) {
      _speed = speed;
      while (_speed > buffer.length) _speed -= buffer.length;
    }

    _gate = gate;
  }

  function setBuffer(audioData: Float32Array) {
    buffer = audioData;
  }

  function fillAudioMono(output: Float32Array) {
    if (!buffer) {
      for (let i = 0; i < output.length; i++) {
        output[i] = 0;
      }
    } else {
      const len = buffer.length;
      for (let i = 0; i < output.length; i++) {
        // linear interpolation between index and (index + speed)
        const readIdx = Math.floor(index);
        const readFrac = index - readIdx;
        let readNext = index + _speed;
        if (readNext < 0) readNext += len;
        if (readNext >= len) readNext -= len;
        const readNextIdx = Math.ceil(readNext);
        const readNextFrac = readNext - readNextIdx;
        const y1 = buffer[readIdx];
        const y2 = buffer[readNextIdx];
        output[i] = y1 + (y2 - y1) * (readFrac + readNextFrac);
        index = readNext;
      }
    }
  }

  return {
    setParams,
    fillAudioMono,
    setBuffer,
  };
}

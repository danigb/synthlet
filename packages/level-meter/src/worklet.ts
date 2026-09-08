// The render quantum. `sampleRate` is a worklet global; the block size is not,
// and the spec fixes it at 128.
const BLOCK = 128;

// Ballistics defaults, from K-Meter - an open-source implementation of Bob
// Katz's published K-System spec, and the only *sourced* set of numbers found
// for a digital peak meter:
// https://github.com/mzuther/K-Meter/blob/master/Source/meter_ballistics.cpp
//
// Peak attack is instantaneous and peak release is 26 dB in 3 s = 8.7 dB/s. The
// "20 dB in 1.7 s" figure that circulates in forums could not be traced to
// IEC/TR 60268-18, which is paywalled and was not obtained, so it is not cited
// here.
//
// Hold is K-Meter's one departure: it holds for 10 s, which is right for a
// mastering meter and far too long for a synth voice.
const DEFAULT_RELEASE_DB_PER_SECOND = 8.7;
const DEFAULT_HOLD_MS = 1500;
const DEFAULT_CLIP_HOLD_MS = 1500;
const DEFAULT_CLIP_THRESHOLD = 1;

// Below this the reading is zero, so `20*log10(peak)` prints -Infinity rather
// than -200 dB and no UI has to special-case a floor that should not exist.
// This is a correctness fix, not a performance one: V8's denormal penalty was
// measured at 1.00x in the state-variable-filter audit, and claiming a speed
// benefit that was measured not to exist would be wrong.
const SILENCE = 1e-10;

// The buffer layout, shared by both transports.
//
//   [0]                          layout version
//   [1]                          channel count
//   [2]                          flags: clip latch, bit c for channel c
//   [HEADER + c*STRIDE + 0]      peak
//   [HEADER + c*STRIDE + 1]      peak hold
//   [HEADER + c*STRIDE + 2]      rms
//   [HEADER + c*STRIDE + 3]      true peak
//   [HEADER + n*STRIDE + 0]      LUFS momentary
//   [HEADER + n*STRIDE + 1]      LUFS short-term
//
// Per-channel slots are linear magnitudes, 0 for silence; the tail is in the dB
// domain. The stride is fixed and the last two slots of each channel are
// reserved rather than appended, so a page running an older bundle against a
// newer one fails the version check in `[0]` instead of reading garbage.
//
// These four numbers are duplicated in `index.ts`: the worklet is bundled on its
// own, and nothing is shared between the two files until ticket 09 introduces
// `dsp.ts`.
const LAYOUT_VERSION = 1;
const HEADER = 3;
const STRIDE = 4;
const TAIL = 2;

const DEFAULT_MAX_CHANNELS = 16;
const DEFAULT_POST_INTERVAL_MS = 16;

export class LevelMeterProcessor extends AudioWorkletProcessor {
  v: Float32Array; // the level buffer: shared, or posted every `pe` blocks
  ht: Int32Array; // per channel, blocks left before the hold marker falls
  cl: Int32Array; // per channel, blocks left on the clip latch
  bp: Float32Array; // per channel, this block's raw maximum
  n: number; // channel capacity of the buffer
  cc: number; // channels most recently seen on the input
  d: number; // release, as a per-block multiplier
  hb: number; // holdMs, in blocks
  cb: number; // clipHoldMs, in blocks
  ct: number; // clip threshold, linear
  pe: number; // blocks between posts, or 0 when the buffer is shared
  pc: number; // blocks since the last post
  r: boolean;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const o = options.processorOptions ?? {};
    const n = o.maxChannels ?? DEFAULT_MAX_CHANNELS;
    this.n = n;
    this.cc = 0;

    // Shared when the main thread could allocate a SharedArrayBuffer; otherwise
    // the processor owns the buffer and posts a copy of it. Nothing below knows
    // which one it is writing to.
    this.v = new Float32Array(o.levelsBuffer ?? HEADER + n * STRIDE + TAIL);

    // Derived from `sampleRate`, once, at construction. A meter's fall rate is a
    // property of the meter, not of the interface it happens to be running on:
    // applying a fixed coefficient per block made the same audio meter
    // differently at 44.1 and 96 kHz, by a factor of 2.2.
    const blockSeconds = BLOCK / sampleRate;
    const release = o.releaseDbPerSecond ?? DEFAULT_RELEASE_DB_PER_SECOND;
    this.d = Math.pow(10, (-release * blockSeconds) / 20);
    this.hb = Math.round((o.holdMs ?? DEFAULT_HOLD_MS) / 1000 / blockSeconds);
    this.cb = Math.round(
      (o.clipHoldMs ?? DEFAULT_CLIP_HOLD_MS) / 1000 / blockSeconds,
    );
    this.ct = o.clipThreshold ?? DEFAULT_CLIP_THRESHOLD;

    // Posted from a block counter rather than a timer: the audio thread has no
    // clock of its own worth trusting, and a counter cannot drift against the
    // render graph. ~16 ms is ~60 Hz, which is one frame's worth of ~20 floats.
    const postInterval = o.postIntervalMs ?? DEFAULT_POST_INTERVAL_MS;
    this.pe = o.levelsBuffer
      ? 0
      : Math.max(1, Math.round(postInterval / 1000 / blockSeconds));
    this.pc = 0;

    this.ht = new Int32Array(n);
    this.cl = new Int32Array(n);
    this.bp = new Float32Array(n);

    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
        case "CLEAR_CLIP":
          this.cl.fill(0);
          this.v[2] = 0;
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

    // How many channels to copy, how many to measure and how often to decay are
    // three different numbers, and one loop used to conflate all three.

    // Copy: all of them. The node is a pass-through and has no business
    // dropping audio - the loop used to be capped at 8, so a 9-channel signal
    // came out with channels 8 and up silent.
    const copied = Math.min(input.length, output.length);
    for (let channel = 0; channel < copied; channel++) {
      output[channel].set(input[channel]);
    }

    // Measure: as many as the buffer holds, which is the number the caller
    // chose. Anything above that is passed through unmetered rather than
    // written past the end of the view.
    const bp = this.bp;
    const measured = Math.min(input.length, bp.length);
    for (let channel = 0; channel < measured; channel++) {
      const chIn = input[channel];
      let blockPeak = 0;
      for (let i = 0; i < chIn.length; i++) {
        const x = chIn[i] < 0 ? -chIn[i] : chIn[i];
        if (x > blockPeak) blockPeak = x;
      }
      bp[channel] = blockPeak;
    }
    for (let channel = measured; channel < bp.length; channel++) {
      bp[channel] = 0;
    }

    // Decay: every slot, every block, whatever the channel count is - including
    // zero, which is what an unconnected input delivers. The decay used to live
    // inside the measurement loop, so disconnecting the source froze the
    // reading at its last value for the life of the context.
    const v = this.v;
    let flags = 0;
    for (let channel = 0; channel < bp.length; channel++) {
      const blockPeak = bp[channel];
      const slot = HEADER + channel * STRIDE;

      // Instant attack, exponential release. The attack falls out of the
      // comparison and the release is one multiply.
      let peak = v[slot] * this.d;
      if (blockPeak > peak) peak = blockPeak;
      if (peak < SILENCE) peak = 0;
      v[slot] = peak;

      // The hold marker is a running maximum, parked for `hb` blocks after it
      // was last raised and then released at the same rate as the peak.
      let hold = v[slot + 1];
      if (peak >= hold) {
        hold = peak;
        this.ht[channel] = this.hb;
      } else if (this.ht[channel] > 0) {
        this.ht[channel]--;
      } else {
        hold *= this.d;
        if (hold < SILENCE) hold = 0;
      }
      v[slot + 1] = hold;

      // `blockPeak` is already the largest |x| in the block, so one compare
      // says whether any sample in it reached the threshold.
      if (blockPeak >= this.ct) this.cl[channel] = this.cb;
      else if (this.cl[channel] > 0) this.cl[channel]--;
      if (this.cl[channel] > 0) flags |= 1 << channel;
    }

    // The channel count survives a disconnected input. An empty `inputs[0]` is
    // "nothing this block", not "zero channels of audio", and reporting 0 would
    // hide the decay that ticket 04 exists to make visible.
    if (measured > 0) this.cc = measured;
    v[0] = LAYOUT_VERSION;
    v[1] = this.cc;
    v[2] = flags;

    // Post from a block counter. The payload is the buffer itself - one
    // pre-shaped array, not an object literal - so the structured clone is a
    // single small copy.
    if (this.pe !== 0 && ++this.pc >= this.pe) {
      this.pc = 0;
      this.port.postMessage(v);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor("LevelMeterProcessor", LevelMeterProcessor);

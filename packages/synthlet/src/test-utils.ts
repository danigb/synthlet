// A minimal Web Audio mock. It records graph topology and teardown, nothing
// audio-rate: enough to build a compound and check that dispose() reaches every
// node the context created.

/** One scheduled automation call, in the order it was made. */
export type AutomationEvent = { method: string; value?: number; time: number };

export class AudioParamMock {
  value = 0;
  /**
   * Every automation call, in order.
   *
   * A note is automation on a param that already exists - `Instrument` never
   * connects anything to start a note, it writes `setValueAtTime` at a time -
   * so the log *is* the audible behaviour, and asserting on it is how a test
   * says "the gate rose after the frequency was in place".
   */
  readonly events: AutomationEvent[] = [];

  setValueAtTime(value: number, time: number) {
    this.events.push({ method: "setValueAtTime", value, time });
    // `value` still tracks a write at time 0 only: that is what the compound
    // tests read to see a construction-time default.
    if (time === 0) this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ method: "linearRampToValueAtTime", value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ method: "exponentialRampToValueAtTime", value, time });
    return this;
  }

  cancelScheduledValues(time: number) {
    this.events.push({ method: "cancelScheduledValues", time });
    return this;
  }
}

export class AudioNodeMock {
  readonly connections: unknown[] = [];
  disconnectCount = 0;

  constructor(
    public readonly context: any,
    public readonly kind: string,
  ) {
    context.nodes.push(this);
  }

  connect(destination: unknown) {
    this.connections.push(destination);
    // The real connect() returns the destination node, and nothing when the
    // destination is an AudioParam. createConn's pair() relies on it.
    return destination instanceof AudioNodeMock ? destination : undefined;
  }

  disconnect() {
    this.disconnectCount++;
  }
}

export class AudioWorkletNodeMock extends AudioNodeMock {
  readonly messages: unknown[] = [];
  readonly port = {
    postMessage: (message: unknown) => this.messages.push(message),
  };
  readonly parameters: { get(name: string): AudioParamMock };

  constructor(
    context: any,
    processorName: string,
    public readonly options?: unknown,
  ) {
    super(context, processorName);
    const params = new Map<string, AudioParamMock>();
    this.parameters = {
      get(name: string) {
        let param = params.get(name);
        if (!param) {
          param = new AudioParamMock();
          params.set(name, param);
        }
        return param;
      },
    };
  }
}

export class GainNodeMock extends AudioNodeMock {
  readonly gain = new AudioParamMock();

  constructor(context: any) {
    super(context, "GainNode");
  }
}

export class OscillatorNodeMock extends AudioNodeMock {
  readonly frequency = new AudioParamMock();
  readonly detune = new AudioParamMock();
  readonly type: string;
  started = false;

  constructor(context: any, options: { type?: string } = {}) {
    super(context, "OscillatorNode");
    this.type = options.type ?? "sine";
  }

  start() {
    this.started = true;
  }
}

export class BiquadFilterNodeMock extends AudioNodeMock {
  readonly frequency = new AudioParamMock();
  readonly detune = new AudioParamMock();
  readonly Q = new AudioParamMock();
  readonly gain = new AudioParamMock();
  readonly type: string;

  constructor(context: any, options: { type?: string } = {}) {
    super(context, "BiquadFilterNode");
    this.type = options.type ?? "lowpass";
  }
}

export class ConstantSourceNodeMock extends AudioNodeMock {
  readonly offset = new AudioParamMock();
  started = false;

  constructor(context: any, options: { offset?: number } = {}) {
    super(context, "ConstantSourceNode");
    this.offset.value = options.offset ?? 1;
  }

  start() {
    this.started = true;
  }
}

/**
 * Installs the Web Audio constructors the library reaches for and returns a
 * fresh context. `nodes` collects every node created against that context, in
 * creation order.
 */
export function createAudioContextMock() {
  const context = {
    sampleRate: 48000,
    // Mutable, unlike the real read-only one: a test that wants "now" to have
    // moved sets it.
    currentTime: 0,
    nodes: [] as AudioNodeMock[],
    // createRegistrar() adds each processor as a module, once per context.
    addedModules: [] as string[],
    audioWorklet: {
      addModule(url: string) {
        context.addedModules.push(url);
        return Promise.resolve();
      },
    },
  };

  const globals = global as any;
  // connectParams() branches on `input instanceof AudioNode`.
  globals.AudioNode = AudioNodeMock;
  globals.AudioWorkletNode = AudioWorkletNodeMock;
  globals.GainNode = GainNodeMock;
  globals.OscillatorNode = OscillatorNodeMock;
  globals.BiquadFilterNode = BiquadFilterNodeMock;
  globals.ConstantSourceNode = ConstantSourceNodeMock;

  return {
    context: context as unknown as AudioContext,
    nodes: context.nodes,
    addedModules: context.addedModules,
  };
}

export type Trigger = {
  press(): void;
  release(): void;
  connect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void;
};

export function createTrigger(context: AudioContext): Trigger {
  let node: ConstantSourceNode | null = new ConstantSourceNode(context, {
    offset: 0,
  });
  node.start();

  return {
    press(startTime = 0) {
      node?.offset.setValueAtTime(1, startTime);
    },
    release(startTime = 0) {
      node?.offset.setValueAtTime(0, startTime);
    },
    connect: node.connect.bind(node),
    disconnect: () => {
      node?.disconnect();
      node = null;
    },
  };
}

export type Pitch = {
  freq(freq: number, time?: number): void;
  midi(number: number, time?: number): void;
  connect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void;
};

export function createFrequencySource(context: AudioContext): Pitch {
  let node: ConstantSourceNode | null = new ConstantSourceNode(context, {
    offset: 440,
  });

  return {
    freq(freq: number, time = 0) {
      node?.offset.setValueAtTime(freq, time);
    },
    midi(number: number, time = 0) {
      node?.offset.setValueAtTime(440 * Math.pow(2, (number - 69) / 12), time);
    },
    connect: node.connect.bind(node),
    disconnect: () => {
      node?.disconnect();
      node = null;
    },
  };
}

export type Keyboard = {
  gate: Trigger;
  freq: Pitch;
};

export function createKeyboard(context: AudioContext): Keyboard {
  return {
    gate: createTrigger(context),
    freq: createFrequencySource(context),
  };
}

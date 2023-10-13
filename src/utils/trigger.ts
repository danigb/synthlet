export type Trigger = {
  press(): void;
  release(): void;
  connect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void;
};

export function createTrigger(context: AudioContext) {
  let node: ConstantSourceNode | null = context.createConstantSource();
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

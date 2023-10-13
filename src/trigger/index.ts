export type Trigger = {
  noteOn(): void;
  noteOff(): void;
  connect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void;
};

export async function loadTrigger(context: AudioContext) {
  return function trigger(): Trigger {
    let node: ConstantSourceNode | null = context.createConstantSource();
    node.start();

    return {
      noteOn(startTime = 0) {
        node?.offset.setValueAtTime(1, startTime);
      },
      noteOff(startTime = 0) {
        node?.offset.setValueAtTime(0, startTime);
      },
      connect: node.connect.bind(node),
      disconnect: () => {
        node?.disconnect();
        node = null;
      },
    };
  };
}

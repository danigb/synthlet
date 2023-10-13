export function chain(...audioNodes: AudioNode[]) {
  audioNodes.reduce((prev, curr) => prev.connect(curr));

  return function disconnect() {
    audioNodes.forEach((node) => node.disconnect());
  };
}

export function chain(...audioNodes: AudioNode[]) {
  audioNodes.reduce((prev, curr) => prev.connect(curr));

  return function disconnect() {
    audioNodes.forEach((node) => node.disconnect());
  };
}

export type ParamSource = {
  connect: (node: any) => void;
  disconnect: () => void;
};

export function isParamSource(value: any): value is ParamSource {
  return (
    value &&
    typeof value.connect === "function" &&
    typeof value.disconnect === "function"
  );
}

export function getParamsSources(node: AudioNode) {
  if (!(node as any)._paramSources) {
    (node as any)._paramSources = [];
  }
  const _paramSources: ParamSource[] = (node as any)._paramSources;
  return _paramSources;
}

export function connectParamSource(
  node: AudioNode,
  param: AudioParam,
  source: ParamSource
) {
  console.log("CONNECT>>", node, param, source);
  const sources = getParamsSources(node);
  source.connect(param);
  sources.push(source);
}

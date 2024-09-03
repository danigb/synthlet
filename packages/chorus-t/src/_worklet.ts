export type ParamInput = number | ((param: AudioParam) => void) | string;

type DisconnectFn = typeof AudioNode.prototype.disconnect;

type CreateWorkletOptions<N, P> = {
  processorName: string;
  paramNames: readonly string[];
  workletOptions: (params: Partial<P>) => AudioWorkletNodeOptions;
  postCreate?: (node: N) => void;
  validateParams?: (params: Partial<P>) => void;
};

export function createWorkletConstructor<
  N extends AudioWorkletNode,
  P extends Record<string, ParamInput>
>(options: CreateWorkletOptions<N, P>) {
  return (audioContext: AudioContext, params: Partial<P> = {}) => {
    options.validateParams?.(params);
    const node = new AudioWorkletNode(
      audioContext,
      options.processorName,
      options.workletOptions(params)
    ) as N;

    (node as any).__PROCESSOR_NAME__ = options.processorName;
    decorateWorkletNode(node, options.paramNames, params);
    options.postCreate?.(node);

    return node;
  };
}

function decorateWorkletNode(
  node: any,
  paramNames: readonly string[],
  params: any
) {
  for (const paramName of paramNames) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName];
    if (typeof value === "number") param.value = value;
    if (typeof value === "function") value(param);
    node[paramName] = param;
  }
  const _disconnect: DisconnectFn = node.disconnect.bind(node);

  // Must be a fn to use arguments
  function disconnectWorklet() {
    node.port.postMessage({ type: "DISCONNECT" });
    switch (arguments.length) {
      case 0:
        return _disconnect();
      case 1:
        return _disconnect(arguments[0] as number);
      case 2:
        return _disconnect(arguments[0] as AudioNode, arguments[1] as number);
      default:
        return _disconnect(
          arguments[0] as AudioNode,
          arguments[1] as number,
          arguments[2] as number
        );
    }
  }
  node.disconnect = disconnectWorklet;
}

export function createRegistrar(workletName: string, processor: string) {
  return function (context: AudioContext): Promise<void> {
    if (!context.audioWorklet || !context.audioWorklet.addModule) {
      throw Error("AudioWorklet not supported");
    }

    const registerKey = "__SYNTHLET_" + workletName + "_REGISTERED__";
    const worklet = context.audioWorklet as any;
    if (worklet[registerKey]) return Promise.resolve();
    const blob = new Blob([processor], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    worklet[registerKey] = true;
    return worklet.addModule(url);
  };
}

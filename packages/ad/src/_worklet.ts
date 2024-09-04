// DON'T EDIT THIS FILE unless inside scripts/_worklet.ts
// use ./scripts/copy_files.ts to copy this file to the right place
// the goal is to avoid external dependencies on packages
export type ParamInput =
  | number
  | ((param: AudioParam) => () => void)
  | string
  | AudioNode;

type CreateWorkletOptions<N, P> = {
  processorName: string;
  paramNames: readonly string[];
  workletOptions: (params: Partial<P>) => AudioWorkletNodeOptions;
  postCreate?: (node: N) => void;
  validateParams?: (params: Partial<P>) => void;
};

export type DisposableAudioNode = AudioNode & { dispose: () => void };

// TODO: replace in createWorkletConstructor
type DisposableAudioWorkletNode = AudioWorkletNode & {
  dispose: () => void;
};

export function createWorkletConstructor<
  N extends AudioWorkletNode,
  P extends Record<string, ParamInput>
>(options: CreateWorkletOptions<N, P>) {
  return (audioContext: AudioContext, params: Partial<P> = {}): N => {
    options.validateParams?.(params);
    const node = new AudioWorkletNode(
      audioContext,
      options.processorName,
      options.workletOptions(params)
    ) as N;

    (node as any).__PROCESSOR_NAME__ = options.processorName;
    const connected = connectAll(node, options.paramNames, params);
    options.postCreate?.(node);
    return disposable(node, connected);
  };
}

type ConnectedUnit = AudioNode | (() => void) | undefined;

export function connectAll(
  node: any,
  paramNames: readonly string[],
  inputs: any
): ConnectedUnit[] {
  const connected: ConnectedUnit[] = [];

  for (const paramName of paramNames) {
    if (node.parameters) {
      node[paramName] = node.parameters.get(paramName);
    }
    const param = node[paramName];
    const input = inputs[paramName];
    if (typeof input === "number") {
      console.log("SET", paramName, input);
      param.value = input;
    } else if (input instanceof AudioNode) {
      param.value = 0;
      input.connect(param);
      connected.push(input);
    } else if (typeof input === "function") {
      connected.push(input(param));
    }
  }

  return connected;
}

export function disposable<T extends AudioNode>(
  node: T,
  dependencies?: ConnectedUnit[]
): T & DisposableAudioNode {
  let disposed = false;
  return Object.assign(node, {
    dispose() {
      if (disposed) return;
      disposed = true;

      node.disconnect();
      (node as any).port?.postMessage({ type: "DISPOSE" });
      if (!dependencies) return;

      while (dependencies.length) {
        const conn = dependencies.pop();
        if (conn instanceof AudioNode) {
          if (typeof (conn as any).dispose === "function") {
            (conn as any).dispose?.();
          } else {
            conn.disconnect();
          }
        } else if (typeof conn === "function") {
          conn();
        }
      }
    },
  });
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

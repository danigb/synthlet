// DON'T EDIT THIS FILE unless inside scripts/_worklet.ts
// use ./scripts/copy_files.ts to copy this file to the right place
// the goal is to avoid external dependencies on packages

// A "Connector" is a function that takes an AudioContext and returns an AudioNode
// or an custom object with a connect method (that returns a disconnect method)
export type Connector<N extends AudioNode> = (context: AudioContext) => N;

export type ParamInput = number | Connector<AudioNode> | AudioNode;

type CreateWorkletOptions<N, P> = {
  processorName: string;
  paramNames: readonly string[];
  workletOptions: (params: Partial<P>) => AudioWorkletNodeOptions;
  postCreate?: (node: N) => void;
};

export type Disposable<N extends AudioNode> = N & { dispose: () => void };

export function createWorkletConstructor<
  N extends AudioWorkletNode,
  P extends Record<string, ParamInput>
>(options: CreateWorkletOptions<N, P>) {
  return (
    audioContext: AudioContext,
    inputs: Partial<P> = {}
  ): Disposable<N> => {
    const node = new AudioWorkletNode(
      audioContext,
      options.processorName,
      options.workletOptions(inputs)
    ) as N;

    (node as any).__PROCESSOR_NAME__ = options.processorName;
    const connected = connectParams(node, options.paramNames, inputs);
    options.postCreate?.(node);
    return disposable(node, connected);
  };
}

type ConnectedUnit = AudioNode | (() => void);

export function connectParams(
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
    if (!param) throw Error("Invalid param name: " + paramName);
    const input = inputs[paramName];
    if (typeof input === "number") {
      param.value = input;
    } else if (input instanceof AudioNode) {
      param.value = 0;
      input.connect(param);
      connected.push(input);
    } else if (typeof input === "function") {
      param.value = 0;
      const source = input(node.context);
      source.connect(param);
      connected.push(source);
    }
  }

  return connected;
}

export function disposable<N extends AudioNode>(
  node: N,
  dependencies?: ConnectedUnit[]
): Disposable<N> {
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

export function createRegistrar(processorName: string, processor: string) {
  return function (context: AudioContext): Promise<void> {
    const key = "__" + processorName + "__";
    if (key in context) return (context as any)[key];

    if (!context.audioWorklet || !context.audioWorklet.addModule) {
      throw Error("AudioWorklet not supported");
    }

    const blob = new Blob([processor], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const promise = context.audioWorklet.addModule(url);
    (context as any)[key] = promise;
    return promise;
  };
}

export function operator<P, N extends AudioNode>(
  createNode: (context: AudioContext, inputs?: P) => Disposable<N>
) {
  return (inputs?: P): Connector<Disposable<N>> => {
    let node: Disposable<N>;
    return (context) => {
      return (node ??= createNode(context, inputs));
    };
  };
}

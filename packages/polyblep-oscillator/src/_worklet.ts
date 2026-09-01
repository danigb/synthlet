// DON'T EDIT THIS FILE unless inside scripts/_worklet.ts
// use ./scripts/copy_files.ts to copy this file to the right place
// the goal is to avoid external dependencies on packages

// A Connector defers construction of a node until it has a context: given an
// AudioContext it returns the node. Anywhere a module takes a ParamInput you
// can pass a number, a live AudioNode, or a Connector.
export type Connector<N extends AudioNode> = (context: AudioContext) => N;

export type ParamInput = number | Connector<AudioNode> | AudioNode;

// A module's description of one of its parameters: exactly what Web Audio's
// `parameterDescriptors` needs, and the shape exposed as `X.descriptors`.
export type ParamDescriptor = {
  name: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  automationRate: "a-rate" | "k-rate";
};

type CreateWorkletOptions<N, P> = {
  processorName: string;
  descriptors: readonly ParamDescriptor[];
  workletOptions: (params: Partial<P>) => AudioWorkletNodeOptions;
  postCreate?: (node: N) => void;
};

export type Disposable<N extends AudioNode> = N & { dispose: () => void };

export function createWorkletConstructor<
  N extends AudioWorkletNode,
  P extends Record<string, ParamInput>
>(options: CreateWorkletOptions<N, P>) {
  const paramNames = options.descriptors.map((d) => d.name);
  const create = (
    audioContext: AudioContext,
    inputs: Partial<P> = {}
  ): Disposable<N> => {
    const node = new AudioWorkletNode(
      audioContext,
      options.processorName,
      options.workletOptions(inputs)
    ) as N;

    (node as any).__PROCESSOR_NAME__ = options.processorName;
    const connected = connectParams(node, paramNames, inputs);
    options.postCreate?.(node);
    return disposable(node, connected);
  };

  // The parameter list travels with the factory: `AdsrEnv.descriptors`.
  return Object.assign(create, { descriptors: options.descriptors });
}

export type ConnectedUnit = AudioNode | (() => void);

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

/**
 * Give `node` ownership of the nodes it was built from.
 *
 * The returned node gains a `dispose()` that disconnects it, posts a `DISPOSE`
 * message to its worklet port if it has one, then disposes every dependency in
 * `dependencies` (calling `dispose()` when present, `disconnect()` otherwise,
 * and plain functions as teardown callbacks).
 *
 * It composes with any `dispose` the node already has rather than replacing it,
 * and is idempotent - calling it twice is a no-op.
 *
 * To declare a whole compound - what it owns *and* what it exposes - use
 * `Compound` below, which is this function with a name for each argument.
 */
export function disposable<N extends AudioNode>(
  node: N,
  dependencies?: ConnectedUnit[]
): Disposable<N> {
  // Compose with any dispose the node already has, so wrapping a node
  // (a compound owning its output gain) doesn't discard its cascade.
  const previousDispose = (node as any).dispose as (() => void) | undefined;
  let disposed = false;
  return Object.assign(node, {
    dispose() {
      if (disposed) return;
      disposed = true; // set before previousDispose(): it may call back here

      previousDispose?.call(node);
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

/**
 * A compound is a group of modules that is itself a module: `N` is the node it
 * ends in, `E` the surface it publishes on top.
 */
export type CompoundNode<
  N extends AudioNode,
  E extends object = {}
> = Disposable<N> & E;

/**
 * Declare a compound: the node it outputs from, the nodes it owns, and the
 * properties it exposes.
 *
 * ```ts
 * return Compound({
 *   output: out,
 *   owns: [osc, filter, amp, gate, volume],
 *   exposes: { gate: gate.input, volume: volume.input, osc, filter },
 * });
 * ```
 *
 * `owns` is what `dispose()` tears down: anything passed to a factory is
 * already owned by the module it was passed to, so this is the list of nodes
 * you connected by hand. Listing extras is free - `dispose()` runs once per
 * node - so when in doubt, list everything you created.
 *
 * `exposes` is the compound's public surface: a `Param` node's `.input` when
 * an inlet needs scaling or fan-out, a module's own `AudioParam` otherwise,
 * and the modules themselves when the compound wants them reachable.
 */
export function Compound<N extends AudioNode, E extends object = {}>(options: {
  output: N;
  owns?: ConnectedUnit[];
  exposes?: E;
}): CompoundNode<N, E> {
  // `exposes` goes on before the cascade, so it can't replace `dispose`.
  return disposable(
    Object.assign(options.output, options.exposes),
    options.owns
  ) as CompoundNode<N, E>;
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

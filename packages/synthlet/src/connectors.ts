import { ParamWorkletNode } from "@synthlet/param";
import { Connector, Disposable } from "./_worklet";

// Ensure that the dispose method of the destination node also disposes of the dependant nodes
function withDependencies<N extends AudioNode>(
  src: N | Disposable<N>,
  deps: (AudioNode | Disposable<N>)[]
): Disposable<N> {
  const out = src as Disposable<N>;
  let _dispose = out.dispose;
  out.dispose = () => {
    _dispose();
    deps.forEach((dep) => {
      if ("dispose" in dep) dep.dispose();
    });
  };
  return out;
}

const Gain = (): Connector<GainNode> => (context) => context.createGain();

// Connect two audio nodes and add a dependency between them
const pair =
  <S extends AudioNode, D extends AudioNode>(
    src: Connector<S>,
    dest: Connector<D>
  ): Connector<Disposable<D>> =>
  (context) => {
    const srcN = src(context);
    const destN = dest(context);
    srcN.connect(destN);
    return withDependencies(destN, [srcN]);
  };

// Connect multiple audio nodes in series and return the last one
// The last one will dispose of all the others
const chain =
  (chain: Connector<AudioNode>[]): Connector<Disposable<AudioNode>> =>
  (context) => {
    const nodes = chain.map((node) => node(context));
    return withDependencies(
      nodes.reduce((prev, next) => {
        prev.connect(next);
        return next;
      }),
      nodes
    );
  };

// Connect multiple audio nodes in parallel into a destination and return the destination
// The destination will dispose of all the others
const mixInto =
  <D extends AudioNode>(
    chain: Connector<AudioNode>[],
    dest: Connector<D>
  ): Connector<Disposable<D>> =>
  (context) => {
    const nodes = chain.map((node) => node(context));
    const destN = dest(context);
    nodes.forEach((node) => node.connect(destN));
    return withDependencies(destN, nodes);
  };

const par = (parallel: Connector<AudioNode>[]): Connector<AudioNode> =>
  mixInto(parallel, Gain());

// Connect multiple audio nodes in parallel into a chain
const connectMixChain = (
  src: Connector<AudioNode> | Connector<AudioNode>[],
  dest?: Connector<AudioNode>,
  ...tail: Connector<AudioNode>[]
): Connector<Disposable<AudioNode>> => {
  if (!dest) {
    if (Array.isArray(src)) {
      throw Error("Connect in parallel requires a destination");
    }
    return src as Connector<Disposable<AudioNode>>;
  }
  const head = Array.isArray(src) ? mixInto(src, dest) : pair(src, dest);
  return tail.length > 0 ? chain([head, ...tail]) : head;
};

export const Conn = Object.assign(connectMixChain, {
  pair,
  chain,
  mixInto,
  par,
});

type ParamConnectors = Record<string, Connector<ParamWorkletNode>>;
type ParamConnectorsToInputs<P extends ParamConnectors> = {
  [K in keyof P]: AudioParam;
};

export function WithParams<P extends ParamConnectors>(
  node: Connector<Disposable<AudioNode>>,
  params: P
): Connector<Disposable<AudioNode>> {
  return (context) => {
    const inputs = {} as ParamConnectorsToInputs<P>;
    const n = node(context);
    for (const key in params) {
      const param = params[key];
      inputs[key] = param(context).input;
    }
    return Object.assign(n, inputs);
  };
}

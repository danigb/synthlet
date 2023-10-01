export type ParamsDef = Record<string, ParamDef>;

type ParamDef = {
  min: number;
  max: number;
  defaultValue: number;
  type?: "k" | "a";
};
export type GenerateNodeType<T extends ParamsDef> = AudioWorkletNode & {
  [K in keyof T]: AudioParam;
};
export type GenerateNodeOptions<T extends ParamsDef> = {
  [K in keyof T]: number;
};

export function loadWorklet<T>(code: string) {
  const init = new WeakMap<AudioContext, Promise<void>>();

  return async function load(context: AudioContext) {
    let ready = init.get(context);
    if (!ready) {
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      ready = context.audioWorklet.addModule(url);
      init.set(context, ready);
    }
    return ready;
  };
}

type NodeOptions = Record<string, number | undefined>;

export function workletNodeConstructor<N, O extends NodeOptions>(
  name: string,
  params: ParamsDef
) {
  return (context: AudioContext, options?: O) => {
    const node = new AudioWorkletNode(context, name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    addParams(node, params);
    if (options) setOptions(options, node, params);
    return node as N;
  };
}

export function setOptions(
  options: NodeOptions,
  node: AudioWorkletNode,
  params: ParamsDef
) {
  Object.keys(options).forEach((name) => {
    const param = params[name];
    const value = options[name];
    if (param && typeof value === "number") {
      node.parameters.get(name)?.setValueAtTime(value, 0);
    }
  });
}

function addParam(name: string, node: AudioWorkletNode) {
  Object.defineProperty(node, name, {
    get() {
      return node.parameters.get(name);
    },
  });
}
export function addParams(node: AudioWorkletNode, params: ParamsDef) {
  const names = Object.keys(params);
  names.forEach((name) => addParam(name, node));
}

export function toWorkletParams(params: ParamsDef) {
  return Object.keys(params).map((name) => {
    const { min: minValue, max: maxValue, defaultValue } = params[name];
    return { name, minValue, maxValue, defaultValue, automationRate: "k-rate" };
  });
}
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

export function createWorklet(name: string) {
  return (context: AudioContext) =>
    new AudioWorkletNode(context, name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
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

export type ParamsDef = Record<string, ParamDef>;

type ParamDef = {
  min: number;
  max: number;
  defaultValue: number;
  type?: "k" | "a";
};

export function toWorkletParams(params: ParamsDef) {
  return Object.keys(params).map((name) => {
    const { min: minValue, max: maxValue, defaultValue } = params[name];
    return { name, minValue, maxValue, defaultValue, automationRate: "k-rate" };
  });
}

export type GenerateNodeType<T extends ParamsDef> = AudioWorkletNode & {
  [K in keyof T]: AudioParam;
};

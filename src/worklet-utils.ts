import { ParamsDef } from "./params-utils";

export type ParamSource = {
  connect: (node: any) => void;
  disconnect: () => void;
};

export type GenerateNodeType<T extends ParamsDef> = AudioWorkletNode & {
  [K in keyof T]: AudioParam;
};
type NodeOptions = Record<string, any>;
export type GenerateNodeOptions<T extends ParamsDef> = {
  [K in keyof T]: number | ParamSource;
};

type WorkletProcessorLoader = (context: AudioContext) => Promise<unknown>;
type WorkletConstructor<N, O extends NodeOptions> = (
  context: AudioContext,
  options?: O
) => N;

export function loadWorklet<N, O extends NodeOptions>(
  loadWorklet: WorkletProcessorLoader,
  createWorklet: WorkletConstructor<N, O>
) {
  return async function load(context: AudioContext) {
    await loadWorklet(context);
    return (options?: O) => createWorklet(context, options);
  };
}

export function createLoader<T>(code: string): WorkletProcessorLoader {
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

export function createConstructor<N, O extends NodeOptions>(
  name: string,
  params: ParamsDef
): WorkletConstructor<N, O> {
  return (context: AudioContext, options?: O) => {
    const node = new AudioWorkletNode(context, name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    addParams(node, params);
    if (options) setWorkletOptions(options, node, params);
    addDisconnect(node);
    return node as N;
  };
}

export function setWorkletOptions(
  options: NodeOptions,
  node: AudioWorkletNode,
  params: ParamsDef
) {
  Object.keys(options).forEach((name) => {
    const paramDef = params[name];
    if (!paramDef) return;
    const param = node.parameters.get(name);
    if (!param) return;

    const value = options[name];
    if (typeof value === "number") {
      param.setValueAtTime(value, 0);
    } else if (isParamSource(value)) {
      connectParamSource(node, param, value);
    }
  });
}

export function addDisconnect(node: AudioWorkletNode) {
  const _disconnect = node.disconnect.bind(node);
  (node as any).disconnect = (output: any) => {
    getParamsSources(node).forEach((source) => source.disconnect());
    _disconnect(output);
    if (!output) {
      node.port.postMessage({ type: "DISCONNECT" });
    }
  };
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
    const { min: minValue, max: maxValue, init: defaultValue } = params[name];
    return { name, minValue, maxValue, defaultValue, automationRate: "k-rate" };
  });
}

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
  const sources = getParamsSources(node);
  source.connect(param);
  sources.push(source);
}

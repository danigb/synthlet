export function loadWorklet<T>(
  code: string,
  create: (context: AudioContext) => T
) {
  const init = new WeakMap<AudioContext, Promise<void>>();

  return async function load(context: AudioContext) {
    let ready = init.get(context);
    if (!ready) {
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      ready = context.audioWorklet.addModule(url);
      init.set(context, ready);
    }
    return ready.then(() => create(context));
  };
}

export function createWorklet(name: string) {
  return (context: AudioContext) =>
    new AudioWorkletNode(context, name, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
}

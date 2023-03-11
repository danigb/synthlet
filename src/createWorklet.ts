export function createWorklet(name: string, code: string) {
  const init = new WeakMap<AudioContext, Promise<void>>();

  return async function load(context: AudioContext) {
    let ready = init.get(context);
    if (!ready) {
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      ready = context.audioWorklet.addModule(url);
      init.set(context, ready);
    }
    await ready;

    const synth = new AudioWorkletNode(context, name, {
      numberOfInputs: 0,
      outputChannelCount: [1],
    });
    return synth;
  };
}

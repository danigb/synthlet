// A per-instrument parameter is one node, connected to every voice.
//
// The alternative - keep a value and loop over the voices on every write - is
// the same arithmetic done n times on the main thread, and it makes a knob a
// method rather than an `AudioParam`. One node makes every knob automatable,
// a preset one write per parameter, and a scheduled preset change free.
//
// **A native `ConstantSourceNode`, not `@synthlet/param`'s `Param`.** `Param`
// is a worklet, and a package with no dependencies cannot register another
// package's processor without carrying a copy of it. A constant source is the
// same thing for a value that only needs an offset: `offset` *is* an
// `AudioParam`, `connect()` fans it out to n targets, and it needs no
// registration - so the inlets can be built the moment `register` resolves.
//
// What is lost is `Param.lin`/`Param.db`'s scaling. So there is no `scale`
// here and values are in the parameter's own units - Hz, seconds, cents, dB -
// and a definition that wants a knob in different units converts inside its
// own `create`, where it has a node to do it with.

/**
 * One declared parameter: its default and the range a preset is validated
 * against and a slider is drawn from.
 *
 * `unit` is documentation, not behaviour. Nothing scales.
 */
export type ParamSpec = {
  default: number;
  min: number;
  max: number;
  unit?: string;
};

export type Fanouts<P extends string> = {
  /** What `create` is handed: a node per parameter, to wire into the voice. */
  inlets: Record<P, AudioNode>;
  /** What the instrument publishes: the same nodes' offsets. */
  params: Record<P, AudioParam>;
  /** The nodes themselves, for the dispose cascade. */
  nodes: ConstantSourceNode[];
};

/**
 * One started `ConstantSourceNode` per declared parameter, sitting at its
 * default.
 *
 * The same `inlets` object is handed to every voice, so a definition may hold
 * on to it: the nodes outlive any single voice.
 */
export function createFanouts<P extends string>(
  context: BaseAudioContext,
  specs: Record<P, ParamSpec>,
): Fanouts<P> {
  const inlets = {} as Record<P, AudioNode>;
  const params = {} as Record<P, AudioParam>;
  const nodes: ConstantSourceNode[] = [];

  for (const name of Object.keys(specs) as P[]) {
    const node = new ConstantSourceNode(context);
    node.offset.value = specs[name].default;
    // A source that is never started emits nothing, and the parameter would
    // read as silence rather than as its default.
    node.start();
    inlets[name] = node;
    params[name] = node.offset;
    nodes.push(node);
  }

  return { inlets, params, nodes };
}

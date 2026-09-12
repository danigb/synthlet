// DON'T EDIT THIS FILE unless inside scripts/_levels.ts
// use ./scripts/copy_files.ts to copy this file to the right place
// the goal is to avoid external dependencies on packages

// The transport a processor uses to show the main thread a number it computed.
//
// `scripts/_spectrum.ts` records the rule for this directory: a helper earns a
// place here once its *readings have to line up across packages*. This is that,
// and the reader is the thing that lines up - one `LevelMeterUI`, one React
// hook and one `subscribe` read every package's meter, so if two packages wrote
// their own transports the renderer could draw only one of them and the two
// would drift the way copy-pasted stubs drift. `_gate.ts` is the precedent: a
// contract shared by copy between the packages that emit a gate and the ones
// that consume it, so detection cannot differ between them.
//
// Copied rather than depended on, for the reason `worklet-copies.test.ts`
// gives: every package declares `dependencies: {}`, and a `@synthlet/levels`
// would put a shared dependency in every consumer's graph to save about a
// kilobyte.
//
// What is here is the *mechanism* - a header, a shared buffer or a posted copy,
// a monotonic version, one animation frame for the whole page. What each
// package declares for itself is its own slots: `level-meter` writes four per
// channel plus a loudness tail, `lookahead-limiter` writes one number.

/**
 * Words reserved at the front of every levels view.
 *
 * `[0]` layout version, `[1]` a count whose meaning is the package's (channels,
 * voices, slots), `[2]` flags - one bit per channel, for a clip latch.
 *
 * `[0]` is what makes a mismatched bundle fail loudly: registering two builds
 * of one processor in a single context leaves the first one's code in place,
 * because the registrar caches by processor *name*, and a stride that moved
 * underneath a reader would otherwise be read as data.
 */
export const LEVELS_HEADER = 3;

/** Which way a package's readings reach the main thread. */
export type LevelsTransport = "shared" | "message";

/**
 * `SharedArrayBuffer` exists in every current browser but is only *usable* on a
 * cross-origin isolated page - and unusable ones are still constructible in
 * some engines, so both halves are checked.
 *
 * Never a precondition. A library cannot ask its consumer for COOP and COEP:
 * setting them on an origin breaks that origin's other cross-origin embeds, and
 * a static host such as GitHub Pages cannot set headers at all.
 */
export function sharedLevelsAvailable(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated
  );
}

/** Called once per animation frame with the frame's timestamp. */
export type FrameTick = (now: number) => void;

// Interval of the `setTimeout` fallback, in ms. Roughly 60 Hz, for environments
// with no `requestAnimationFrame` at all - a worker driving an `OffscreenCanvas`,
// or a test.
const FALLBACK_MS = 16;

const ticks = new Set<FrameTick>();

// Increments once per frame the driver runs. `subscribe` uses it to deliver at
// most one notification per frame from two triggers - a posted message and the
// driver's own tick - without either having to know about the other.
let frameIndex = 0;

// Non-null exactly while a frame is pending. Holds the cancel for whichever
// scheduler requested it, so a fallback timeout is never handed to
// `cancelAnimationFrame`.
let cancelPending: (() => void) | null = null;

function now(): number {
  return typeof performance !== "undefined" && performance
    ? performance.now()
    : Date.now();
}

function schedule() {
  if (cancelPending) return;
  // Resolved per frame rather than once at module load: the globals may not
  // exist yet when the module is first evaluated, and a test may replace them.
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof request === "function") {
    const handle = request(frame);
    cancelPending = () => {
      if (typeof cancel === "function") cancel(handle);
    };
  } else {
    const handle = setTimeout(() => frame(now()), FALLBACK_MS);
    cancelPending = () => clearTimeout(handle);
  }
}

function frame(timestamp: number) {
  cancelPending = null;
  frameIndex++;
  try {
    // A copy, so a tick that detaches itself - or another renderer - during the
    // frame does not mutate the set being iterated.
    for (const tick of Array.from(ticks)) tick(timestamp);
  } finally {
    // In `finally` so one renderer throwing does not stop every other meter on
    // the page. The error still reaches the frame callback and is reported.
    if (ticks.size > 0) schedule();
  }
}

/**
 * Run `tick` once per animation frame. Returns the function that stops it;
 * calling it twice is harmless.
 */
export function onAnimationFrame(tick: FrameTick): () => void {
  ticks.add(tick);
  schedule();
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    ticks.delete(tick);
    if (ticks.size === 0 && cancelPending) {
      cancelPending();
      cancelPending = null;
    }
  };
}

/**
 * Which frame the driver is on. Only the ordering matters: two things that read
 * the same number are inside the same frame.
 */
export function currentFrame(): number {
  return frameIndex;
}

/** True while a frame is pending. For tests, and for 16's success criterion 2. */
export function isDriverRunning(): boolean {
  return cancelPending !== null;
}

/** How many listeners the driver is ticking. For tests. */
export function frameListenerCount(): number {
  return ticks.size;
}

/**
 * The main-thread half: one view, a version that moves when the numbers do, and
 * subscribers that are told at most once per animation frame.
 *
 * `length` is the whole view including `LEVELS_HEADER`. `layoutVersion` is the
 * value the processor writes into `[0]`; a view still at 0 has had no block
 * yet, and anything else is a mismatched bundle.
 */
export function createLevelsReader(options: {
  length: number;
  layoutVersion: number;
  /** Names the package in the mismatch error. */
  name?: string;
}) {
  const { length, layoutVersion } = options;
  const name = options.name ?? "levels";

  const shared = sharedLevelsAvailable();
  const buffer = shared
    ? new SharedArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT)
    : undefined;
  // One view, whichever half wrote it: shared memory the audio thread is
  // updating live, or the destination a posted copy lands in.
  const view = buffer ? new Float32Array(buffer) : new Float32Array(length);
  // What the view held when `version` was last bumped.
  const previous = new Float32Array(length);

  let version = 0;
  const listeners = new Set<(view: Float32Array) => void>();
  let stopTicking: (() => void) | null = null;
  // The version and the frame of the most recent delivery. Together they are
  // the whole rate policy: never twice for the same reading, never twice in one
  // animation frame.
  let notifiedVersion = 0;
  let notifiedFrame = -1;

  /** Bump `version` if, and only if, the view actually changed. */
  const read = () => {
    const layout = view[0];
    if (layout !== 0 && layout !== layoutVersion) {
      throw Error(
        `${name}: the registered processor writes layout ${layout}, this build reads ${layoutVersion}`,
      );
    }
    let changed = false;
    for (let i = 0; i < length; i++) {
      if (previous[i] !== view[i]) {
        previous[i] = view[i];
        changed = true;
      }
    }
    if (changed) version++;
    return changed;
  };

  // Called from two places - a posted frame arriving, and the driver's tick -
  // and neither needs to know about the other. Under `"message"` at a ~16 ms
  // cadence a message is a frame, so a subscriber hears about each one as it
  // lands; turn the interval down and the extra messages coalesce here rather
  // than waking a framework four times between paints, with the tick delivering
  // whatever a message could not.
  const notify = () => {
    if (listeners.size === 0 || version === notifiedVersion) return;
    const frame = currentFrame();
    if (frame === notifiedFrame) return;
    notifiedFrame = frame;
    notifiedVersion = version;
    for (const listener of Array.from(listeners)) listener(view);
  };

  return {
    view,
    /** Pass to the processor; `undefined` means it should post instead. */
    buffer,
    transport: (shared ? "shared" : "message") as LevelsTransport,
    /** True while the readings live in memory both threads can see. */
    shared,

    get version() {
      return version;
    },

    read,

    /** A posted frame landed. */
    receive(data: Float32Array) {
      view.set(data);
      read();
      notify();
    },

    /**
     * The view was written in place - by a main-thread driver, which needs no
     * transport at all. The same two steps `receive` takes after a copy lands.
     */
    written() {
      read();
      notify();
    },

    /**
     * Call `listener` when the numbers change; returns the unsubscribe.
     *
     * At most one call per animation frame and none at all while nothing is
     * changing. The first subscriber starts the page's one animation frame and
     * the last one stops it.
     */
    subscribe(listener: (view: Float32Array) => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        // From here, not from zero: a new subscriber is told about the next
        // change, not about the one before it arrived.
        notifiedVersion = version;
        notifiedFrame = -1;
        // Under `"shared"` the tick is the only trigger there is - memory has
        // no events - and under `"message"` it delivers what a message had to
        // coalesce.
        stopTicking = onAnimationFrame(() => {
          if (shared) read();
          notify();
        });
      }
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopTicking?.();
          stopTicking = null;
        }
      };
    },

    /** Drop every subscriber and, with the last of them, the animation frame. */
    release() {
      listeners.clear();
      stopTicking?.();
      stopTicking = null;
    },
  };
}

export type LevelsReader = ReturnType<typeof createLevelsReader>;

/**
 * The processor half: write into a view, and post it every `blocksPerPost`
 * blocks - or never, when the view is shared memory the reader can already see.
 *
 * The payload is the buffer itself, one pre-shaped array rather than an object
 * literal, so the structured clone is a single small copy.
 */
export function createLevelsWriter(options: {
  port: { postMessage(data: unknown): void };
  view: Float32Array;
  /** Blocks between posts; 0 when the buffer is shared, so nothing is posted. */
  blocksPerPost: number;
}) {
  const { port, view, blocksPerPost } = options;
  let counter = 0;

  return {
    view,
    /** Call once per block, after the readings have been written. */
    flush() {
      if (blocksPerPost === 0) return;
      if (++counter >= blocksPerPost) {
        counter = 0;
        port.postMessage(view);
      }
    },
  };
}

/**
 * Blocks between posts for a target interval, or 0 when the view is shared.
 *
 * A counter rather than a timer: the audio thread has no clock of its own worth
 * trusting, and a counter cannot drift against the render graph.
 */
export function blocksPerPost(
  shared: boolean,
  postIntervalMs: number,
  frameSize: number,
  sampleRate: number,
): number {
  if (shared) return 0;
  return Math.max(
    1,
    Math.round(postIntervalMs / 1000 / (frameSize / sampleRate)),
  );
}

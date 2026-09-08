import { frameListenerCount, isDriverRunning } from "./driver";
import {
  dbToUnit,
  formatDb,
  Levels,
  LevelMeterUI,
  LevelMeterUIOptions,
} from "./meter-ui";

// Jest runs in the node environment (root `package.json`), so there is no
// `document`, no canvas, no `ResizeObserver` and no `requestAnimationFrame`.
// That is convenient rather than awkward: a renderer that draws under these
// stubs is a renderer with no `document` dependency, which is one of the
// ticket's requirements, and the frame stub is how "eight meters, one callback"
// gets asserted at all.

class GradientStub {
  readonly stops: [number, string][] = [];
  addColorStop(offset: number, color: string) {
    // What `CanvasGradient.addColorStop` does outside [0, 1], and the defect
    // this ticket exists for.
    if (!(offset >= 0 && offset <= 1)) {
      throw new Error(`IndexSizeError: ${offset}`);
    }
    this.stops.push([offset, color]);
  }
}

class PatternStub {}

type Rect = { x: number; y: number; w: number; h: number; style: unknown };
type Text = { text: string; x: number; y: number };

class ContextStub {
  fillStyle: unknown = "";
  font = "";
  textAlign = "";
  textBaseline = "";
  readonly rects: Rect[] = [];
  readonly texts: Text[] = [];
  readonly transforms: number[][] = [];
  readonly gradients: GradientStub[] = [];
  patterns = 0;

  constructor(readonly canvas: CanvasStub) {}

  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) {
    this.transforms.push([a, b, c, d, e, f]);
  }
  clearRect() {}
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, style: this.fillStyle });
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y });
  }
  createLinearGradient() {
    const gradient = new GradientStub();
    this.gradients.push(gradient);
    return gradient;
  }
  createPattern() {
    this.patterns++;
    return new PatternStub();
  }
}

class CanvasStub {
  context: ContextStub | null = null;
  clientWidth: number;
  clientHeight: number;

  constructor(
    public width = 200,
    public height = 40,
    css?: { width: number; height: number },
  ) {
    this.clientWidth = css?.width ?? width;
    this.clientHeight = css?.height ?? height;
  }

  getContext(kind: string) {
    if (kind !== "2d") return null;
    return (this.context ??= new ContextStub(this));
  }
  // What `createStripesPattern` uses instead of `document.createElement`.
  cloneNode(_deep: boolean) {
    return new CanvasStub(this.width, this.height);
  }
  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight };
  }
}

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  readonly observed: unknown[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    ResizeObserverStub.instances.push(this);
  }
  observe(target: unknown) {
    this.observed.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

const frames = new Map<number, (now: number) => void>();
let nextHandle = 1;
let requested = 0;
let cancelled = 0;

function runFrame(now = 0) {
  const due = Array.from(frames.values());
  frames.clear();
  for (const callback of due) callback(now);
}

beforeAll(() => {
  (globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
    requested++;
    const handle = nextHandle++;
    frames.set(handle, cb);
    return handle;
  };
  (globalThis as any).cancelAnimationFrame = (handle: number) => {
    cancelled++;
    frames.delete(handle);
  };
  (globalThis as any).ResizeObserver = ResizeObserverStub;
  (globalThis as any).devicePixelRatio = 1;
});

const attached: LevelMeterUI[] = [];

function ui(options: Partial<LevelMeterUIOptions> = {}) {
  const meter = new LevelMeterUI(options);
  attached.push(meter);
  return meter;
}

beforeEach(() => {
  frames.clear();
  requested = 0;
  cancelled = 0;
  ResizeObserverStub.instances.length = 0;
  (globalThis as any).devicePixelRatio = 1;
});

afterEach(() => {
  // The driver is module state shared by every test in the file.
  for (const meter of attached.splice(0)) meter.detach();
  expect(frameListenerCount()).toBe(0);
});

type FakeInit = {
  channelCount?: number;
  peak?: number[];
  hold?: number[];
  rms?: number[];
  clipped?: boolean[];
};

function fakeLevels(init: FakeInit = {}): Levels {
  const channelCount = init.channelCount ?? init.peak?.length ?? 1;
  const reader =
    (values: number[] | undefined, fallback: number) => (c: number) =>
      values?.[c] ?? fallback;
  return {
    channelCount,
    version: 1,
    peak: reader(init.peak, -Infinity),
    hold: reader(init.hold, -Infinity),
    rms: reader(init.rms, -Infinity),
    truePeak: () => NaN,
    clipped: (c: number) => init.clipped?.[c] ?? false,
    clearClip: () => {},
    momentary: NaN,
    shortTerm: NaN,
    error: false,
    // `snapshot()` allocates and the renderer is documented as never calling it.
    snapshot: () => {
      throw new Error("the renderer must not allocate a snapshot per frame");
    },
  };
}

function source(levels: Levels) {
  return { getLevels: jest.fn(() => levels) };
}

const ctxOf = (canvas: CanvasStub) => canvas.getContext("2d") as ContextStub;
const asCanvas = (canvas: CanvasStub) => canvas as unknown as HTMLCanvasElement;

// The peak bars are the only rectangles painted with the gradient object.
function barsOf(ctx: ContextStub): Rect[] {
  const gradient = ctx.gradients[ctx.gradients.length - 1];
  return ctx.rects.filter((rect) => rect.style === gradient);
}

describe("dbToUnit", () => {
  it("places a value on the scale", () => {
    expect(dbToUnit(-12, -60, 0)).toBeCloseTo(0.8, 12);
    expect(dbToUnit(-60, -60, 0)).toBe(0);
    expect(dbToUnit(0, -60, 0)).toBe(1);
  });

  it("never leaves [0, 1], whatever it is given", () => {
    const cases: [number, number, number][] = [
      [-Infinity, -40, 0],
      [NaN, -40, 0],
      [12, -40, 0],
      [-200, -40, 0],
      [-18, -12, 0],
      [-6, -60, -20],
      [-18, -3, 0],
      [0, 0, 0],
    ];
    for (const [db, min, max] of cases) {
      const unit = dbToUnit(db, min, max);
      expect(unit).toBeGreaterThanOrEqual(0);
      expect(unit).toBeLessThanOrEqual(1);
    }
  });

  it("reads silence as the bottom of the scale", () => {
    expect(dbToUnit(-Infinity, -40, 0)).toBe(0);
  });
});

describe("formatDb", () => {
  it("uses a real minus sign", () => {
    expect(formatDb(-Infinity)).toBe("−∞");
    expect(formatDb(-12.34, 1)).toBe("−12.3");
    expect(formatDb(-40)).toBe("−40");
    expect(formatDb(0)).toBe("0");
  });
});

describe("gradient stops", () => {
  // Every row of the table in the ticket, working cases and throwing ones.
  const ranges: [number, number][] = [
    [-40, 0],
    [-60, 0],
    [-20, 0],
    [-12, 0],
    [-60, -20],
    [-3, 0],
  ];

  it.each(ranges)(
    "renders {minDb: %d, maxDb: %d} without throwing",
    (minDb, maxDb) => {
      const canvas = new CanvasStub(200, 40);
      const meter = ui({ minDb, maxDb });
      meter.setCanvas(asCanvas(canvas));
      expect(() => meter.render(fakeLevels({ peak: [-6, -20] }))).not.toThrow();

      const gradient = ctxOf(canvas).gradients[0];
      expect(gradient.stops).toHaveLength(5);
      for (const [offset] of gradient.stops) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(1);
      }
    },
  );

  it("sorts the stops", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ minDb: -60, maxDb: -20 });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-30] }));
    const offsets = ctxOf(canvas).gradients[0].stops.map(([at]) => at);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("refuses an inverted range at construction, not on the first frame", () => {
    expect(() => new LevelMeterUI({ minDb: 0, maxDb: -40 })).toThrow(
      RangeError,
    );
    expect(() => new LevelMeterUI({ minDb: -40, maxDb: -40 })).toThrow(
      RangeError,
    );
  });

  it("recomputes when the range changes", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6] }));
    meter.render(fakeLevels({ peak: [-6] }));
    expect(ctxOf(canvas).gradients).toHaveLength(1);
    meter.setRange(-12, 0);
    meter.render(fakeLevels({ peak: [-6] }));
    expect(ctxOf(canvas).gradients).toHaveLength(2);
  });
});

describe("setCanvas", () => {
  it("builds a new gradient for a second canvas", () => {
    const first = new CanvasStub(200, 40);
    const second = new CanvasStub(300, 60);
    const meter = ui();
    meter.setCanvas(asCanvas(first));
    meter.render(fakeLevels({ peak: [-6] }));
    meter.setCanvas(asCanvas(second));
    meter.render(fakeLevels({ peak: [-6] }));

    // A `CanvasGradient` belongs to the context that made it, so the second
    // canvas must have made its own.
    expect(ctxOf(second).gradients).toHaveLength(1);
    expect(barsOf(ctxOf(second)).length).toBeGreaterThan(0);
    expect(ctxOf(first).gradients).toHaveLength(1);
  });

  it("does nothing at all without a canvas", () => {
    expect(() => ui().render(fakeLevels({ peak: [0] }))).not.toThrow();
  });
});

describe("layout", () => {
  it("draws every channel, with a positive bar, on a canvas too small for the old math", () => {
    // `height / channels - 2` was -0.75 here, and drew nothing.
    const canvas = new CanvasStub(200, 10);
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: new Array(8).fill(-6) }));

    const bars = barsOf(ctxOf(canvas));
    expect(bars).toHaveLength(8);
    for (const bar of bars) expect(bar.h).toBeGreaterThan(0);
  });

  it("fills the canvas", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ scale: false });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [0, 0] }));

    const bars = barsOf(ctxOf(canvas));
    expect(bars).toHaveLength(2);
    expect(bars[0].y).toBe(0);
    // Bars occupy the full height apart from one inter-channel gap.
    const bottom = bars[1].y + bars[1].h;
    expect(bottom).toBeGreaterThanOrEqual(40 - 2);
    expect(bottom).toBeLessThanOrEqual(40);
  });

  it("draws nothing per channel when there are no channels", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    expect(() => meter.render(fakeLevels({ channelCount: 0 }))).not.toThrow();
    expect(ctxOf(canvas).gradients).toHaveLength(0);
  });
});

describe("what it draws", () => {
  const plain: Partial<LevelMeterUIOptions> = {
    scale: false,
    stripes: false,
    clip: false,
    hold: false,
    rms: false,
  };

  it("scales the peak bar by dbToUnit", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ ...plain, minDb: -40, maxDb: 0 });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-20, -Infinity] }));

    const bars = barsOf(ctxOf(canvas));
    expect(bars[0].w).toBeCloseTo(dbToUnit(-20, -40, 0) * 200, 6);
    // Silence draws no bar at all rather than a sliver.
    expect(bars).toHaveLength(1);
  });

  it("insets the RMS bar inside the peak bar", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ ...plain, rms: true });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6], rms: [-18] }));

    const ctx = ctxOf(canvas);
    const bar = barsOf(ctx)[0];
    const rms = ctx.rects.find((rect) => rect.style === meter.colors.rms)!;
    expect(rms).toBeDefined();
    expect(rms.w).toBeLessThan(bar.w);
    expect(rms.y).toBeGreaterThan(bar.y);
    expect(rms.y + rms.h).toBeLessThan(bar.y + bar.h);
  });

  it("marks the hold, and only when there is one", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ ...plain, hold: true, minDb: -40, maxDb: 0 });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-20, -20], hold: [-6, -Infinity] }));

    const marks = ctxOf(canvas).rects.filter(
      (rect) => rect.style === meter.colors.hold,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].x).toBeCloseTo(dbToUnit(-6, -40, 0) * 200, 6);
  });

  it("keeps the hold marker inside the bar at full scale", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ ...plain, hold: true });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [0], hold: [12] }));

    const mark = ctxOf(canvas).rects.find(
      (rect) => rect.style === meter.colors.hold,
    )!;
    expect(mark.x + mark.w).toBeLessThanOrEqual(200);
  });

  it("lights the clip indicator, and latches whatever the accessor latches", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui({ ...plain, clip: true });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6, -6], clipped: [true, false] }));

    const ctx = ctxOf(canvas);
    const lit = ctx.rects.filter((rect) => rect.style === meter.colors.high);
    const dark = ctx.rects.filter(
      (rect) => rect.style === meter.colors.clipOff,
    );
    expect(lit).toHaveLength(1);
    expect(dark).toHaveLength(1);
    // In its own slice at the top of the scale, so it never covers the bar.
    const bar = barsOf(ctx)[0];
    expect(lit[0].x).toBeGreaterThanOrEqual(bar.x + bar.w);
  });

  it("draws a dB scale by default and drops it when asked", () => {
    const canvas = new CanvasStub(200, 60);
    const meter = ui({ minDb: -40, maxDb: 0 });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6] }));
    expect(ctxOf(canvas).texts.map((t) => t.text)).toEqual([
      "−40",
      "−30",
      "−20",
      "−10",
      "0",
    ]);

    const bare = new CanvasStub(200, 60);
    const noScale = ui({ scale: false });
    noScale.setCanvas(asCanvas(bare));
    noScale.render(fakeLevels({ peak: [-6] }));
    expect(ctxOf(bare).texts).toHaveLength(0);
  });

  it("picks round ticks for a narrow range", () => {
    const canvas = new CanvasStub(200, 60);
    const meter = ui({ minDb: -3, maxDb: 0 });
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-1] }));
    expect(ctxOf(canvas).texts.map((t) => t.text)).toEqual([
      "−3",
      "−2",
      "−1",
      "0",
    ]);
  });

  it("builds the stripe pattern without a document", () => {
    expect((globalThis as any).document).toBeUndefined();
    const canvas = new CanvasStub(200, 40);
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6] }));
    expect(ctxOf(canvas).patterns).toBe(1);
  });
});

describe("orientation", () => {
  it("grows bars along the value axis it was given", () => {
    const options: Partial<LevelMeterUIOptions> = {
      scale: false,
      stripes: false,
      clip: false,
      hold: false,
      rms: false,
      minDb: -40,
      maxDb: 0,
    };
    const levels = fakeLevels({ peak: [-20, -20] });

    const wide = new CanvasStub(200, 40);
    const horizontal = ui({ ...options, orientation: "horizontal" });
    horizontal.setCanvas(asCanvas(wide));
    horizontal.render(levels);
    const across = barsOf(ctxOf(wide))[0];
    expect(across.w).toBeCloseTo(0.5 * 200, 6);
    expect(across.h).toBeCloseTo(40 / 2 - 2, 6);

    const tall = new CanvasStub(40, 200);
    const vertical = ui({ ...options, orientation: "vertical" });
    vertical.setCanvas(asCanvas(tall));
    vertical.render(levels);
    const up = barsOf(ctxOf(tall))[0];
    expect(up.h).toBeCloseTo(0.5 * 200, 6);
    expect(up.w).toBeCloseTo(40 / 2 - 2, 6);
    // Bars grow from the bottom.
    expect(up.y + up.h).toBeCloseTo(200, 6);
  });
});

describe("attach", () => {
  function attachOne(options: Partial<LevelMeterUIOptions> = {}) {
    const canvas = new CanvasStub(200, 40);
    const meter = ui(options);
    const levels = fakeLevels({ peak: [-6, -12] });
    const node = source(levels);
    meter.attach(asCanvas(canvas), node);
    return { canvas, meter, node };
  }

  it("shares one animation frame across eight meters", () => {
    const meters = Array.from({ length: 8 }, () => attachOne());
    expect(frameListenerCount()).toBe(8);
    // One request for the first `attach`, and none for the other seven.
    expect(requested).toBe(1);

    runFrame();
    expect(requested).toBe(2);
    for (const { node } of meters)
      expect(node.getLevels).toHaveBeenCalledTimes(1);

    runFrame();
    expect(requested).toBe(3);
    for (const { node } of meters)
      expect(node.getLevels).toHaveBeenCalledTimes(2);
  });

  it("leaves no loop and no observer after detach", () => {
    const { meter } = attachOne();
    const observer = ResizeObserverStub.instances[0];
    expect(observer.observed).toHaveLength(1);
    expect(isDriverRunning()).toBe(true);

    meter.detach();
    expect(observer.disconnected).toBe(true);
    expect(cancelled).toBe(1);
    expect(isDriverRunning()).toBe(false);
    expect(frames.size).toBe(0);
  });

  it("stops the loop only when the last meter detaches", () => {
    const first = attachOne();
    const second = attachOne();
    first.meter.detach();
    expect(isDriverRunning()).toBe(true);
    second.meter.detach();
    expect(isDriverRunning()).toBe(false);
  });

  it("survives a renderer that throws, and keeps ticking the rest", () => {
    const good = attachOne();
    const bad = attachOne();
    bad.node.getLevels.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => runFrame()).toThrow("boom");
    // The next frame was still requested, so the healthy meter is still alive.
    expect(isDriverRunning()).toBe(true);
    bad.meter.detach();
    runFrame();
    expect(good.node.getLevels).toHaveBeenCalledTimes(2);
  });

  it("does not start a loop for the manual path", () => {
    const canvas = new CanvasStub(200, 40);
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6] }));
    expect(isDriverRunning()).toBe(false);
    expect(requested).toBe(0);
  });

  it("sizes the backing store for the device pixel ratio", () => {
    (globalThis as any).devicePixelRatio = 2;
    const canvas = new CanvasStub(200, 40, { width: 100, height: 40 });
    const meter = ui();
    meter.attach(asCanvas(canvas), source(fakeLevels({ peak: [-6] })));
    runFrame();

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(80);
    // Drawing happens in CSS pixels, mapped up by the transform.
    expect(ctxOf(canvas).transforms[0]).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it("follows a resize", () => {
    (globalThis as any).devicePixelRatio = 2;
    const canvas = new CanvasStub(200, 80, { width: 100, height: 40 });
    const meter = ui();
    meter.attach(asCanvas(canvas), source(fakeLevels({ peak: [-6] })));
    runFrame();
    expect(canvas.width).toBe(200);

    canvas.clientWidth = 50;
    canvas.clientHeight = 20;
    ResizeObserverStub.instances[0].callback();
    runFrame();
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(40);
  });

  it("leaves the pixel size alone on the manual path", () => {
    (globalThis as any).devicePixelRatio = 2;
    const canvas = new CanvasStub(200, 40, { width: 100, height: 20 });
    const meter = ui();
    meter.setCanvas(asCanvas(canvas));
    meter.render(fakeLevels({ peak: [-6] }));
    expect(canvas.width).toBe(200);
    expect(ctxOf(canvas).transforms[0]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("re-attaching to another canvas leaves one listener", () => {
    const { meter } = attachOne();
    const second = new CanvasStub(200, 40);
    meter.attach(asCanvas(second), source(fakeLevels({ peak: [-6] })));
    expect(frameListenerCount()).toBe(1);
    expect(ResizeObserverStub.instances[0].disconnected).toBe(true);
  });
});

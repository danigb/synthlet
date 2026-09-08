import { onAnimationFrame } from "./driver";
// Type-only, so it is erased: `index.ts` imports this module for the class, and
// a value import back would be a cycle.
import type { Levels } from "./index";

/** Anything the renderer can read levels from - a `LevelMeterWorkletNode`. */
export interface LevelsSource {
  getLevels(): Levels;
}

// `OffscreenCanvas` is a target too, which is why nothing here reaches for
// `document`. Its 2D context has the same drawing surface as the DOM one; the
// two are separate types in `lib.dom.d.ts` with no common base, so the context
// is held as the DOM type and narrowed at the one place it is obtained.
export type LevelMeterUICanvas = HTMLCanvasElement | OffscreenCanvas;

export type LevelMeterUIColors = {
  /** Behind everything. */
  background: string;
  /** The bar below -18 dB. */
  low: string;
  /** The bar at -6 dB. */
  mid: string;
  /** The bar at 0 dB, and the lit clip indicator. */
  high: string;
  /** The RMS bar, drawn inset inside the peak bar. */
  rms: string;
  /** The peak-hold marker. */
  hold: string;
  /** The clip indicator when nothing has clipped. */
  clipOff: string;
  /** The LED-segment overlay. */
  stripes: string;
  /** Scale ticks and labels. */
  scale: string;
};

// The one part of the previous renderer that was right. `rgba()` with three
// arguments is legal CSS Color 4 but reads as a mistake; the value is unchanged.
const DEFAULT_COLORS: LevelMeterUIColors = {
  background: "rgb(0, 0, 0)",
  low: "rgb(60, 180, 60)",
  mid: "rgb(220, 220, 0)",
  high: "rgb(160, 16, 0)",
  rms: "rgba(255, 255, 255, 0.35)",
  hold: "rgb(235, 235, 235)",
  clipOff: "rgb(40, 12, 10)",
  stripes: "rgba(39, 39, 39, 0.9)",
  scale: "rgb(150, 150, 150)",
};

export type LevelMeterUIOptions = {
  /** Bottom of the scale, in dB. Default -40. */
  minDb: number;
  /** Top of the scale, in dB. Default 0. */
  maxDb: number;
  /** Which way the bars grow. Default "horizontal". */
  orientation: "horizontal" | "vertical";
  /** Draw the dB scale. Default true. */
  scale: boolean;
  /** dB values to mark. Default derived from the range. */
  scaleDb: number[] | null;
  /** Draw the latching clip indicator at the top of each bar. Default true. */
  clip: boolean;
  /** Draw the peak-hold marker. Default true. */
  hold: boolean;
  /** Draw the RMS bar inset in the peak bar. Default true. */
  rms: boolean;
  /** The LED-segment stripe overlay. Default true. */
  stripes: boolean;
  /** Gap between channel bars, in px. Default 2, shrunk to fit. */
  gap: number;
  colors: Partial<LevelMeterUIColors>;
};

const SCALE_FONT = 9;
// Bottom strip for a horizontal meter: tick, gap, label.
const SCALE_HEIGHT = 3 + 2 + SCALE_FONT;
// Right-hand strip for a vertical meter: wide enough for "-40".
const SCALE_WIDTH = 3 + 3 + SCALE_FONT * 2;
// A scale is not worth the space it costs on a very small canvas.
const SCALE_MIN_RATIO = 3;
const CLIP_SIZE = 6;
const HOLD_SIZE = 2;

/**
 * Position of `db` on a `minDb`..`maxDb` scale, always within `[0, 1]`.
 * `-Infinity` - silence - and `NaN` are 0.
 *
 * This is the computation the previous renderer got wrong (it placed gradient
 * stops at unclamped positions, and `addColorStop` throws outside `[0, 1]`). It
 * is also the computation every hand-built UI needs, which is why it is
 * exported; ticket 16 re-exports it from the main entry.
 */
export function dbToUnit(db: number, minDb: number, maxDb: number): number {
  // Written as a negated comparison so `NaN` falls to 0 rather than through.
  if (!(db > minDb)) return 0;
  if (!(maxDb > minDb)) return 1;
  const unit = (db - minDb) / (maxDb - minDb);
  return unit > 1 ? 1 : unit;
}

/**
 * `db` for display, with a real minus sign. `formatDb(-Infinity)` is `"−∞"`.
 * Ticket 16 re-exports this from the main entry.
 */
export function formatDb(db: number, digits = 0): string {
  if (Number.isNaN(db)) return "–";
  if (db === -Infinity) return "−∞";
  if (db === Infinity) return "∞";
  const text = db.toFixed(digits);
  return text.charCodeAt(0) === 45 ? `−${text.slice(1)}` : text;
}

// Steps that read as round numbers on a dB scale. The first one that puts at
// most six labels on the axis wins.
const TICK_STEPS = [1, 2, 3, 6, 10, 12, 20, 30, 60];
const MAX_TICKS = 6;

function defaultTicks(minDb: number, maxDb: number): number[] {
  const range = maxDb - minDb;
  const step =
    TICK_STEPS.find((candidate) => range / candidate <= MAX_TICKS) ??
    TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (
    let db = Math.ceil(minDb / step) * step;
    db <= maxDb + 1e-9;
    db += step
  ) {
    ticks.push(db);
  }
  return ticks;
}

// A 2D context, whichever surface it came from. Both halves of
// `LevelMeterUICanvas` produce one with the same drawing API.
type Context2D = CanvasRenderingContext2D;

// The stripe tile, without `document`. `OffscreenCanvas` covers workers and is
// a valid `createPattern` source everywhere it exists; cloning the target canvas
// covers the DOM without asking for a global the renderer may not have.
function createTile(
  host: unknown,
  width: number,
  height: number,
): LevelMeterUICanvas | null {
  const Offscreen = (globalThis as any).OffscreenCanvas;
  if (typeof Offscreen === "function") return new Offscreen(width, height);
  const node = host as { cloneNode?(deep: boolean): any } | null;
  if (node && typeof node.cloneNode === "function") {
    const clone = node.cloneNode(false);
    clone.width = width;
    clone.height = height;
    return clone;
  }
  return null;
}

/**
 * Draws a meter's levels on a canvas.
 *
 * ```ts
 * const ui = new LevelMeterUI({ orientation: "vertical" });
 * ui.attach(canvas, meter);  // takes the loop, the sizing and the teardown
 * ui.detach();
 * ```
 *
 * `setCanvas(canvas)` plus `render(levels)` remains the manual path, for callers
 * who already own an animation loop. In that mode the caller owns the canvas's
 * pixel size too, so the renderer does not touch `devicePixelRatio`.
 */
export class LevelMeterUI {
  canvas: LevelMeterUICanvas | null = null;
  context: Context2D | null = null;
  /** The canvas's pixel size, as of the last render. */
  width = 0;
  height = 0;
  minDb: number;
  maxDb: number;
  orientation: "horizontal" | "vertical";
  readonly colors: LevelMeterUIColors;

  private readonly showScale: boolean;
  private readonly scaleDb: number[] | null;
  private readonly showClip: boolean;
  private readonly showHold: boolean;
  private readonly showRms: boolean;
  private readonly showStripes: boolean;
  private readonly gap: number;

  private gradient: CanvasGradient | null = null;
  private gradientKey = "";
  private stripes: CanvasPattern | null = null;
  private stripesKey = "";

  private meter: LevelsSource | null = null;
  private stopTicking: (() => void) | null = null;
  private observer: ResizeObserver | null = null;
  // Set by the observer, applied on the next render. Reading `clientWidth` in
  // the frame instead would force a layout every frame, which is the thing
  // `ResizeObserver` exists to avoid.
  private cssSize: { width: number; height: number } | null = null;
  // Only the attached path owns the canvas's pixel size, so only it scales.
  private dpr = 1;

  constructor(options: Partial<LevelMeterUIOptions> = {}) {
    this.minDb = options.minDb ?? -40;
    this.maxDb = options.maxDb ?? 0;
    assertRange(this.minDb, this.maxDb);
    this.orientation = options.orientation ?? "horizontal";
    this.showScale = options.scale ?? true;
    this.scaleDb = options.scaleDb ?? null;
    this.showClip = options.clip ?? true;
    this.showHold = options.hold ?? true;
    this.showRms = options.rms ?? true;
    this.showStripes = options.stripes ?? true;
    this.gap = Math.max(0, options.gap ?? 2);
    this.colors = { ...DEFAULT_COLORS, ...options.colors };
  }

  /** Move the meter to another canvas. Drops every context-bound cache. */
  setCanvas(canvas: LevelMeterUICanvas) {
    this.canvas = canvas;
    // `CanvasGradient` and `CanvasPattern` belong to the context that made them.
    // The previous renderer cached both on first render and never cleared them,
    // so a second `setCanvas` drew with objects from the old context.
    this.invalidate();
    this.context = canvas.getContext("2d") as Context2D | null;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  /** Change the displayed range. Recomputes the gradient. */
  setRange(minDb: number, maxDb: number) {
    assertRange(minDb, maxDb);
    this.minDb = minDb;
    this.maxDb = maxDb;
    this.invalidate();
  }

  /**
   * Draw `meter` on `canvas` until `detach()`. The renderer owns the animation
   * frame, the `devicePixelRatio` sizing and the resize handling from here on.
   *
   * Every attached renderer on the page shares one `requestAnimationFrame`.
   */
  attach(canvas: LevelMeterUICanvas, meter: LevelsSource): this {
    this.detach();
    this.setCanvas(canvas);
    this.meter = meter;
    this.cssSize = measure(canvas);

    const Observer = (globalThis as any).ResizeObserver;
    if (typeof Observer === "function" && isElement(canvas)) {
      this.observer = new Observer(() => {
        this.cssSize = measure(canvas);
      }) as ResizeObserver;
      this.observer.observe(canvas as HTMLCanvasElement);
    }

    this.stopTicking = onAnimationFrame(() => {
      const source = this.meter;
      if (source) this.render(source.getLevels());
    });
    return this;
  }

  /** Stop drawing. Leaves no pending frame and no observer. */
  detach() {
    this.stopTicking?.();
    this.stopTicking = null;
    this.observer?.disconnect();
    this.observer = null;
    this.cssSize = null;
    this.dpr = 1;
    this.meter = null;
  }

  /** True while `attach()` is in effect. */
  get attached(): boolean {
    return this.stopTicking !== null;
  }

  render(levels: Levels) {
    const ctx = this.context;
    if (!ctx || !this.canvas) return;
    this.syncSize();
    const { width, height, dpr } = this;
    if (width <= 0 || height <= 0) return;

    // Everything below is in CSS pixels; the transform maps them to the backing
    // store, which is what makes the meter sharp on a 2x display.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width / dpr;
    const h = height / dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, w, h);

    const vertical = this.orientation === "vertical";
    const scale =
      this.showScale &&
      (vertical
        ? w > SCALE_WIDTH * SCALE_MIN_RATIO
        : h > SCALE_HEIGHT * SCALE_MIN_RATIO);
    const meterW = vertical && scale ? w - SCALE_WIDTH : w;
    const meterH = !vertical && scale ? h - SCALE_HEIGHT : h;

    // The value axis runs left to right, or bottom to top; the channel axis is
    // the other one. The clip indicator gets its own slice at the top of the
    // value axis so it never covers the bar.
    const axisSpan = vertical ? meterH : meterW;
    const crossSpan = vertical ? meterW : meterH;
    const clipSize = this.showClip ? Math.min(CLIP_SIZE, axisSpan / 4) : 0;
    const valueSpan = axisSpan - clipSize;

    const channels = Math.max(0, Math.floor(levels.channelCount) || 0);
    if (channels > 0 && valueSpan > 0 && crossSpan > 0) {
      this.syncGradient(ctx, vertical, meterH, valueSpan);
      // `height / channels - 2` went negative at eight channels in 10 px and
      // drew nothing. Shrinking the gap instead keeps every bar positive and
      // the bars filling the canvas at any size.
      const slot = crossSpan / channels;
      const gap = Math.min(this.gap, slot / 4);
      const thickness = slot - gap;
      for (let c = 0; c < channels; c++) {
        const cross = c * slot;
        const peak = dbToUnit(levels.peak(c), this.minDb, this.maxDb);
        ctx.fillStyle = this.gradient ?? this.colors.low;
        fill(ctx, vertical, meterH, 0, peak * valueSpan, cross, thickness);

        if (this.showRms) {
          const inset = thickness / 4;
          const rms = dbToUnit(levels.rms(c), this.minDb, this.maxDb);
          ctx.fillStyle = this.colors.rms;
          fill(
            ctx,
            vertical,
            meterH,
            0,
            rms * valueSpan,
            cross + inset,
            thickness - inset * 2,
          );
        }

        if (this.showHold) {
          const holdDb = levels.hold(c);
          const hold = dbToUnit(holdDb, this.minDb, this.maxDb);
          if (holdDb > this.minDb) {
            const at = Math.min(hold * valueSpan, valueSpan - HOLD_SIZE);
            ctx.fillStyle = this.colors.hold;
            fill(
              ctx,
              vertical,
              meterH,
              Math.max(0, at),
              Math.max(0, at) + HOLD_SIZE,
              cross,
              thickness,
            );
          }
        }

        if (clipSize > 0) {
          ctx.fillStyle = levels.clipped(c)
            ? this.colors.high
            : this.colors.clipOff;
          fill(
            ctx,
            vertical,
            meterH,
            valueSpan + 1,
            axisSpan,
            cross,
            thickness,
          );
        }
      }
    }

    if (scale) this.drawScale(ctx, vertical, meterW, meterH, valueSpan);
    if (this.showStripes) this.drawStripes(ctx);
  }

  private invalidate() {
    this.gradient = null;
    this.gradientKey = "";
    this.stripes = null;
    this.stripesKey = "";
  }

  private syncSize() {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.attached) {
      const ratio = globalThis.devicePixelRatio;
      this.dpr = typeof ratio === "number" && ratio > 0 ? ratio : 1;
      const css = this.cssSize ?? measure(canvas);
      if (css && css.width > 0 && css.height > 0) {
        const w = Math.max(1, Math.round(css.width * this.dpr));
        const h = Math.max(1, Math.round(css.height * this.dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
      }
    } else {
      // The manual path: the caller sized the canvas and has already made
      // whatever `devicePixelRatio` decision they wanted.
      this.dpr = 1;
    }
    this.width = canvas.width;
    this.height = canvas.height;
  }

  private syncGradient(
    ctx: Context2D,
    vertical: boolean,
    meterH: number,
    valueSpan: number,
  ) {
    const key = `${this.minDb}|${this.maxDb}|${vertical}|${valueSpan}|${meterH}`;
    if (this.gradient && this.gradientKey === key) return;
    this.gradient = this.createMeterGradient(ctx, vertical, meterH, valueSpan);
    this.gradientKey = key;
  }

  private createMeterGradient(
    ctx: Context2D,
    vertical: boolean,
    meterH: number,
    valueSpan: number,
  ): CanvasGradient {
    const gradient = vertical
      ? ctx.createLinearGradient(0, meterH, 0, meterH - valueSpan)
      : ctx.createLinearGradient(0, 0, valueSpan, 0);

    // Stops are placed by `dbToUnit`, so they are inside `[0, 1]` for every
    // range: `{minDb: -12, maxDb: 0}` put -18 dB at -0.5 and threw
    // `IndexSizeError` on the first frame, inside the caller's animation frame.
    const { low, mid, high } = this.colors;
    const stops: [number, string][] = [
      [0, low],
      [dbToUnit(-18, this.minDb, this.maxDb), low],
      [dbToUnit(-6, this.minDb, this.maxDb), mid],
      [dbToUnit(0, this.minDb, this.maxDb), high],
      [1, high],
    ];
    stops.sort((a, b) => a[0] - b[0]);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    return gradient;
  }

  private drawScale(
    ctx: Context2D,
    vertical: boolean,
    meterW: number,
    meterH: number,
    valueSpan: number,
  ) {
    const ticks = this.scaleDb ?? defaultTicks(this.minDb, this.maxDb);
    ctx.fillStyle = this.colors.scale;
    ctx.font = `${SCALE_FONT}px sans-serif`;
    for (const db of ticks) {
      const at = dbToUnit(db, this.minDb, this.maxDb) * valueSpan;
      const label = formatDb(db);
      if (vertical) {
        const y = meterH - at;
        ctx.fillRect(meterW, y - 0.5, 3, 1);
        ctx.textAlign = "left";
        ctx.textBaseline =
          at <= 0 ? "bottom" : at >= valueSpan ? "top" : "middle";
        ctx.fillText(label, meterW + 6, y);
      } else {
        ctx.fillRect(at - 0.5, meterH, 1, 3);
        ctx.textAlign = at <= 0 ? "left" : at >= valueSpan ? "right" : "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, at, meterH + 5);
      }
    }
  }

  private drawStripes(ctx: Context2D) {
    const key = this.orientation;
    if (!this.stripes || this.stripesKey !== key) {
      this.stripes = this.createStripesPattern(ctx);
      this.stripesKey = key;
    }
    if (!this.stripes) return;
    // Drawn in device pixels, so the segments stay one pixel wide on a 2x
    // display instead of being scaled into a blur.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.stripes;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // The LED-segment look, and the one piece of visual design in the package.
  // The lines run across the bars, so the tile turns with the orientation.
  private createStripesPattern(ctx: Context2D): CanvasPattern | null {
    const vertical = this.orientation === "vertical";
    const tile = createTile(ctx.canvas, vertical ? 1 : 3, vertical ? 3 : 1);
    if (!tile) return null;
    const tileCtx = tile.getContext("2d") as Context2D | null;
    if (!tileCtx) return null;
    tileCtx.fillStyle = this.colors.stripes;
    tileCtx.fillRect(0, 0, 1, 1);
    return ctx.createPattern(tile as CanvasImageSource, "repeat");
  }
}

function assertRange(minDb: number, maxDb: number) {
  // At construction, where it is findable - not on the first frame, inside the
  // caller's `requestAnimationFrame`, which is where the old renderer threw.
  if (!(minDb < maxDb)) {
    throw new RangeError(
      `LevelMeterUI: minDb must be less than maxDb, got ${minDb} and ${maxDb}`,
    );
  }
}

// One rectangle in value-axis/channel-axis terms, for either orientation.
function fill(
  ctx: Context2D,
  vertical: boolean,
  meterH: number,
  from: number,
  to: number,
  cross: number,
  thickness: number,
) {
  if (to <= from || thickness <= 0) return;
  if (vertical) ctx.fillRect(cross, meterH - to, thickness, to - from);
  else ctx.fillRect(from, cross, to - from, thickness);
}

function isElement(canvas: LevelMeterUICanvas): boolean {
  return typeof (canvas as any).getBoundingClientRect === "function";
}

function measure(
  canvas: LevelMeterUICanvas,
): { width: number; height: number } | null {
  const element = canvas as any;
  if (typeof element.clientWidth !== "number") return null;
  return { width: element.clientWidth, height: element.clientHeight };
}

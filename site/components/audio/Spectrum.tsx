import { useEffect, useRef } from "react";

/** Backing-store size. The canvas is scaled to its container by CSS. */
const WIDTH = 512;
const HEIGHT = 160;

/** Gridline every 5 kHz, labelled. */
const GRID_HZ = 5000;

/**
 * A live spectrum, drawn from an `AnalyserNode` you already own.
 *
 * The component deliberately does **not** create the analyser: it takes one, so
 * the node stays inside the synth's `Compound` and is torn down by its
 * `dispose()` along with everything else. All this owns is a
 * `requestAnimationFrame` loop, cancelled on unmount.
 *
 * **The frequency axis is linear**, not logarithmic. A log axis reads a mix
 * better; a linear one reads *aliasing* better, which is the only reason this
 * exists. The harmonics of a high-pitched saw are evenly spaced on a linear
 * axis, so alias partials show up as extra spikes in the gaps between them
 * rather than being squeezed into the last tenth of the width.
 */
export function Spectrum({
  analyser,
  label,
  color = "#0ea5e9",
  className,
  canvasClassName = "w-full rounded border border-fd-border",
  marks,
  markColor = "#0ea5e9",
}: {
  analyser: AnalyserNode | null;
  label: string;
  /**
   * The trace. The docs pass nothing and get the blue they always had; the
   * tutorial kit passes its `--learn-audio` token, resolved.
   */
  color?: string;
  className?: string;
  /** The canvas's own frame. Defaults to the documentation's. */
  canvasClassName?: string;
  /**
   * Frequencies to rule a vertical line at, read **once per frame**: where the
   * theory says a partial should be, drawn over where it actually is. The
   * tutorial uses it to put a prediction and a measurement on one picture; the
   * docs pass nothing and get no lines.
   */
  marks?: () => number[];
  markColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The marks are recomputed per frame from a control that is moving, so the
  // function changes identity on every render of the page above. A ref keeps
  // the draw loop from being torn down and rebuilt sixty times a second.
  const marksRef = useRef(marks);
  marksRef.current = marks;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bins = new Float32Array(analyser.frequencyBinCount);
    const nyquist = analyser.context.sampleRate / 2;
    // `getFloatFrequencyData` reports dBFS between these two, so they are the
    // vertical range for free - no extra scaling constant to keep in step.
    const { minDecibels, maxDecibels } = analyser;
    const span = maxDecibels - minDecibels;

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatFrequencyData(bins);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      // A neutral grey panel and grey gridlines: readable against both the
      // light and the dark fumadocs theme without reading either one's tokens.
      ctx.fillStyle = "rgba(128, 128, 128, 0.08)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(128, 128, 128, 0.35)";
      ctx.fillStyle = "rgba(128, 128, 128, 0.9)";
      ctx.lineWidth = 1;
      ctx.font = "10px system-ui, sans-serif";
      for (let hz = GRID_HZ; hz < nyquist; hz += GRID_HZ) {
        const x = Math.round((hz / nyquist) * WIDTH) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
        ctx.fillText(`${hz / 1000}k`, x + 3, HEIGHT - 4);
      }

      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      for (let i = 0; i < bins.length; i++) {
        const level = (bins[i] - minDecibels) / span;
        const y = HEIGHT - Math.max(0, Math.min(1, level)) * HEIGHT;
        ctx.lineTo((i / (bins.length - 1)) * WIDTH, y);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fillStyle = color + "55";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();

      // Over the measurement, not under it: the point is to see the two
      // disagree, and a line hidden behind a peak proves nothing.
      const predicted = marksRef.current?.();
      if (predicted?.length) {
        ctx.strokeStyle = markColor;
        ctx.setLineDash([2, 3]);
        for (const hz of predicted) {
          if (hz <= 0 || hz >= nyquist) continue;
          const x = Math.round((hz / nyquist) * WIDTH) + 0.5;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, HEIGHT);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser, color, markColor]);

  return (
    <div className={className}>
      <div className="text-xs mb-1" style={{ color }}>
        {label}
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className={canvasClassName}
      />
    </div>
  );
}

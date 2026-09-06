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
}: {
  analyser: AnalyserNode | null;
  label: string;
  color?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser, color]);

  return (
    <div className={className}>
      <div className="text-xs mb-1" style={{ color }}>
        {label}
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="w-full rounded border border-fd-border"
      />
    </div>
  );
}

import { useEffect, useRef } from "react";

/** Backing-store size. The canvas is scaled to its container by CSS. */
const WIDTH = 512;
const HEIGHT = 140;

/**
 * The smallest peak the vertical scale will zoom to.
 *
 * Without a floor, a `None` shape or an LFO whose depth envelope has not opened
 * yet would be scaled up until the `Float32` noise filled the screen.
 */
const MIN_PEAK = 0.02;

/**
 * A live time-domain scope, drawn from an `AnalyserNode` you already own.
 *
 * Like `Spectrum.tsx`, the component deliberately does **not** create the
 * analyser: it takes one, so the node stays inside the synth's `Compound` and is
 * torn down by its `dispose()` along with everything else. All this owns is a
 * `requestAnimationFrame` loop, cancelled on unmount.
 *
 * It exists for a module whose entire output is a *shape*. What it draws is the
 * node's own samples - not a JavaScript reimplementation of the waveform, which
 * would be a picture that agrees with a second copy of the maths rather than
 * evidence about the one that ships.
 *
 * The window is `analyser.fftSize` samples, so at the maximum 32768 it is 0.74 s
 * at 44.1 kHz: a little over a cycle at 1.5 Hz, and several at 5. Slower than
 * that and the trace is an arc rather than a cycle, which is the honest picture
 * of what a slow LFO is doing.
 */
export function Scope({
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

    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(samples);

      let peak = MIN_PEAK;
      for (const value of samples) peak = Math.max(peak, Math.abs(value));

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      // A neutral grey panel, readable against both the light and the dark
      // fumadocs theme without reading either one's tokens.
      ctx.fillStyle = "rgba(128, 128, 128, 0.08)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Zero, and the two full-scale rails the vertical zoom is showing.
      ctx.strokeStyle = "rgba(128, 128, 128, 0.35)";
      ctx.lineWidth = 1;
      for (const level of [-1, 0, 1]) {
        const y = Math.round(HEIGHT / 2 - (level * HEIGHT) / 2) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * WIDTH;
        const y = HEIGHT / 2 - (samples[i] / peak) * (HEIGHT / 2 - 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "rgba(128, 128, 128, 0.9)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`peak ${peak.toFixed(3)}`, 4, 12);
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

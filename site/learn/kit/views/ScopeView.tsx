"use client";

import { Scope } from "@/components/audio/Scope";
import { useEffect, useRef } from "react";
import type { AnalyserRef, ScopeOptions } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { ViewFrame } from "./ViewFrame";

/** Backing-store size, matching the shared `Scope` so the two views line up. */
const WIDTH = 512;
const HEIGHT = 140;

/** How long a `contour` window is when the patch does not say. */
const DEFAULT_SECONDS = 2;

/** The smallest peak the vertical scale will zoom to. See `Scope.tsx`. */
const MIN_PEAK = 0.02;

/*
 * A picture of the signal over time, at two very different time scales.
 *
 * `wave` is the shared `Scope`: `analyser.fftSize` samples, a few cycles, the
 * shape of the waveform. It is the picture chapter 1 wants.
 *
 * `contour` is a second or two - the shape of the *envelope*, which is what
 * chapters 2 and 3 are about. It is drawn here rather than by widening the
 * analyser's window for two reasons: the analyser belongs to the patch and a
 * view should not reach in and resize it, and even at the maximum `fftSize` the
 * window is 0.74 s, which is shorter than the release of almost every sound
 * worth drawing. So the contour is a rolling history: one peak reading per
 * animation frame, pushed along a ring, which is exactly what an envelope looks
 * like and costs one `Float32Array`.
 */
export function ScopeView({
  source,
  label,
  options,
  runtime,
  color,
}: {
  source: AnalyserRef<any>;
  label?: string;
  options?: ScopeOptions;
  runtime: PatchRuntime;
  color: string;
}) {
  const analyser = runtime.synth ? source(runtime.synth) : null;
  const contour = options?.window === "contour";

  return contour ? (
    <ContourScope
      analyser={analyser}
      label={label ?? "Contour"}
      seconds={options?.seconds ?? DEFAULT_SECONDS}
      color={color}
    />
  ) : (
    <Scope
      analyser={analyser}
      label={label ?? "Waveform"}
      color={color}
      className="min-w-0"
      canvasClassName="w-full rounded-learn border border-learn-border"
    />
  );
}

function ContourScope({
  analyser,
  label,
  seconds,
  color,
}: {
  analyser: AnalyserNode | null;
  label: string;
  seconds: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const samples = new Float32Array(analyser.fftSize);
    // One column per pixel; at 60 frames a second, `WIDTH` columns is 8.5 s, so
    // a shorter window simply uses fewer of them.
    const columns = Math.max(2, Math.min(WIDTH, Math.round(seconds * 60)));
    const history = new Float32Array(columns);
    let next = 0;
    let filled = 0;
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(samples);

      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      history[next] = peak;
      next = (next + 1) % columns;
      filled = Math.min(columns, filled + 1);

      let ceiling = MIN_PEAK;
      for (const value of history) ceiling = Math.max(ceiling, value);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < filled; i++) {
        // Oldest on the left: the reading written `filled` frames ago.
        const value = history[(next - filled + i + columns * 2) % columns];
        const x = (i / Math.max(1, columns - 1)) * WIDTH;
        const y = HEIGHT - (value / ceiling) * (HEIGHT - 4) - 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser, seconds, color]);

  return (
    <ViewFrame label={`${label} · ${seconds}s`}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label={label}
        className="w-full rounded-learn border border-learn-border"
      />
    </ViewFrame>
  );
}

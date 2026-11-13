"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawDemoScene, drawSkeleton } from "@/lib/draw";
import { nearestFrameIndex } from "@/lib/pose";
import type { Analysis, Handedness, PoseTrack, View } from "@/lib/types";

export interface PlayerHandle { seek: (t: number) => void }

interface Props {
  kind: "video" | "demo";
  videoUrl?: string | null;
  track: PoseTrack | null;
  analysis: Analysis | null;
  view: View;
  hand: Handedness;
  controlRef: React.MutableRefObject<PlayerHandle | null>;
}

const SPEEDS = [0.25, 0.5, 1];

export default function SwingPlayer({ kind, videoUrl, track, analysis, view, hand, controlRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 720, h: 960 });
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [speed, setSpeed] = useState(kind === "demo" ? 0.5 : 1);
  const [demoTime, setDemoTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const demoT = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  playingRef.current = playing;

  const times = useMemo(() => track?.frames.map((f) => f.t) ?? [], [track]);
  const duration = track?.duration ?? 0;

  useEffect(() => {
    if (kind === "demo" && track) setDims({ w: track.width, h: track.height });
  }, [kind, track]);

  useEffect(() => {
    controlRef.current = {
      seek: (t: number) => {
        if (kind === "video" && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = t; }
        else { demoT.current = t; setDemoTime(t); setPlaying(false); }
      },
    };
  }, [kind, controlRef]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed, kind]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) {
        let t = 0;
        if (kind === "video") t = videoRef.current?.currentTime ?? 0;
        else {
          if (playingRef.current && duration > 0) {
            demoT.current += dt * speedRef.current;
            if (demoT.current > duration) demoT.current = 0;
            setDemoTime(demoT.current);
          }
          t = demoT.current;
        }
        ctx.clearRect(0, 0, c.width, c.height);
        const idx = nearestFrameIndex(times, t);
        const lm = idx >= 0 ? track?.frames[idx]?.lm : null;
        if (kind === "demo" && lm) drawDemoScene(ctx, lm, c.width, c.height, view);
        if (lm && showSkeleton) {
          drawSkeleton(ctx, lm, c.width, c.height, { hand, handPath: analysis?.handPath, pathUpTo: idx });
        }
        const cp = analysis?.checkpoints.find((k) => Math.abs(k.t - t) < 0.05);
        if (cp) {
          const s = Math.max(1, c.width / 640);
          ctx.font = `600 ${18 * s}px system-ui, sans-serif`;
          const label = `● ${cp.label}`;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(6, 78, 59, 0.85)";
          ctx.fillRect(12 * s, 12 * s, tw + 20 * s, 32 * s);
          ctx.fillStyle = "white"; ctx.fillText(label, 22 * s, 34 * s);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, track, times, duration, analysis, showSkeleton, hand, view]);

  const aspect = dims.w / dims.h;
  const fmtT = (t: number) => `${t.toFixed(2)}s`;

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto overflow-hidden rounded-xl bg-slate-900 shadow-inner"
        style={{ aspectRatio: `${dims.w} / ${dims.h}`, width: `min(100%, calc(68vh * ${aspect}))` }}
      >
        {kind === "video" && videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            muted
            className="absolute inset-0 h-full w-full"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth) setDims({ w: v.videoWidth, h: v.videoHeight });
              v.playbackRate = speed;
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {kind === "video" && !track && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
            Skeleton overlay appears after analysis
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {kind === "demo" && (
          <>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="rounded-lg bg-emerald-800 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <input
              type="range"
              min={0}
              max={duration}
              step={1 / 60}
              value={demoTime}
              onChange={(e) => { demoT.current = +e.target.value; setDemoTime(+e.target.value); setPlaying(false); }}
              className="min-w-40 flex-1 accent-emerald-700"
              aria-label="Scrub demo swing"
            />
            <span className="w-24 tabular-nums text-slate-600">{fmtT(demoTime)} / {fmtT(duration)}</span>
          </>
        )}
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2 py-1 ${speed === s ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-slate-700">
          <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} className="accent-emerald-700" />
          Skeleton overlay
        </label>
      </div>
      <p className="text-xs text-slate-500">
        <span className="font-medium text-sky-600">Blue</span> = lead arm · <span className="font-medium text-orange-500">orange</span> = hips ·{" "}
        <span className="font-medium text-yellow-500">yellow</span> = hand path
      </p>
    </div>
  );
}

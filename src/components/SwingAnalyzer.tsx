"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SwingPlayer, { type PlayerHandle } from "./SwingPlayer";
import Results from "./Results";
import { analyzeSwing } from "@/lib/analysis";
import { drawDemoScene, drawSkeleton } from "@/lib/draw";
import { grabFrames, loadPoseLandmarker, scanVideo } from "@/lib/mediapipe";
import { DEMO_PROFILES, generateSyntheticTrack, type DemoProfileId } from "@/lib/synthetic";
import type { Analysis, Handedness, Lm, PoseTrack, View } from "@/lib/types";

type Phase = "idle" | "loading" | "scanning" | "analyzing" | "done" | "error";
const ACCEPT = [".mp4", ".mov", ".webm", ".m4v"];

const VIEWS: { id: View; name: string; desc: string }[] = [
  { id: "DTL", name: "Down-the-Line", desc: "Camera behind your hands, pointing at the target. Best for checking swing path, posture and early extension." },
  { id: "FO", name: "Face-On", desc: "Camera facing your chest. Best for checking sway, weight shift, lag and the lead arm." },
];

function nearestLm(track: PoseTrack, i: number): Lm[] | null {
  for (let d = 0; d < track.frames.length; d++) {
    const a = track.frames[i - d]?.lm, b = track.frames[i + d]?.lm;
    if (a) return a; if (b) return b;
  }
  return null;
}

export default function SwingAnalyzer() {
  const [mode, setMode] = useState<"upload" | "demo">("upload");
  const [view, setView] = useState<View>("DTL");
  const [hand, setHand] = useState<Handedness>("right");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<DemoProfileId>("slicer");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0, detected: 0 });
  const [error, setError] = useState<string | null>(null);
  const [videoTrack, setVideoTrack] = useState<PoseTrack | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef({ cancelled: false });

  const demoTrack = useMemo(() => generateSyntheticTrack(profile, view, hand), [profile, view, hand]);
  const track = mode === "demo" ? demoTrack : videoTrack;
  const busy = phase === "loading" || phase === "scanning" || phase === "analyzing";

  const reset = useCallback(() => {
    cancelRef.current.cancelled = true;
    setAnalysis(null); setVideoTrack(null); setError(null); setPhase("idle"); setProgress({ done: 0, total: 0, detected: 0 });
  }, []);

  // Changing inputs invalidates previous results
  useEffect(() => { reset(); }, [mode, view, hand, profile, videoUrl, reset]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const onFile = (f: File | undefined | null) => {
    if (!f) return;
    const ok = f.type.startsWith("video/") || ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) { setError(`"${f.name}" isn't a supported video. Use .mp4, .mov or .webm.`); setPhase("error"); return; }
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setMode("upload");
  };

  const run = async () => {
    cancelRef.current = { cancelled: false };
    const signal = cancelRef.current;
    setError(null); setAnalysis(null);
    try {
      if (mode === "demo") {
        setPhase("analyzing"); setStatus("Running checkpoint + fault pipeline on synthetic pose data…");
        await new Promise((r) => setTimeout(r, 350));
        const a = analyzeSwing(demoTrack, view, hand);
        const thumbs = a.checkpoints.map((cp) => {
          const c = document.createElement("canvas"); c.width = 240; c.height = 320;
          const ctx = c.getContext("2d")!; const lm = demoTrack.frames[cp.frameIndex].lm!;
          drawDemoScene(ctx, lm, 240, 320, view);
          drawSkeleton(ctx, lm, 240, 320, { hand, scale: 0.6 });
          return c.toDataURL("image/jpeg", 0.85);
        });
        a.checkpoints.forEach((cp, i) => (cp.thumb = thumbs[i]));
        setAnalysis(a); setPhase("done");
        return;
      }
      if (!videoUrl) { setError("Upload a swing video first, or switch to the Demo Swing Simulator."); setPhase("error"); return; }
      setPhase("loading"); setStatus("Loading MediaPipe Pose Landmarker…");
      const { landmarker, source, delegate } = await loadPoseLandmarker(setStatus);
      setPhase("scanning"); setStatus(`Scanning frames with PoseLandmarker lite (${source}, ${delegate}). Your video stays on this device.`);
      const t = await scanVideo(videoUrl, landmarker, (p) => {
        setProgress({ done: p.done, total: p.total, detected: p.detected });
        const c = previewRef.current, ctx = c?.getContext("2d");
        if (c && ctx && p.preview) {
          const v = p.preview.video;
          c.width = 240; c.height = Math.round((240 * v.videoHeight) / (v.videoWidth || 1));
          ctx.drawImage(v, 0, 0, c.width, c.height);
          if (p.preview.lm) drawSkeleton(ctx, p.preview.lm, c.width, c.height, { hand, scale: 0.5 });
        }
      }, signal);
      if (signal.cancelled) return;
      setPhase("analyzing"); setStatus("Detecting checkpoints and computing metrics…");
      const a = analyzeSwing(t, view, hand);
      try {
        const thumbs = await grabFrames(videoUrl, a.checkpoints.map((c) => c.t), (ctx, w, h, i) => {
          const lm = nearestLm(t, a.checkpoints[i].frameIndex);
          if (lm) drawSkeleton(ctx, lm, w, h, { hand, scale: 0.5 });
        }, 240);
        a.checkpoints.forEach((cp, i) => (cp.thumb = thumbs[i]));
      } catch { /* thumbnails are optional */ }
      if (signal.cancelled) return;
      setVideoTrack(t); setAnalysis(a); setPhase("done");
    } catch (e) {
      if (signal.cancelled) return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const jump = (t: number) => {
    playerRef.current?.seek(t);
    playerBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Step 1: setup */}
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Step 1</p>
          <h2 className="text-xl font-bold text-slate-900">Choose your swing</h2>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {(["upload", "demo"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-2 transition ${mode === m ? "bg-white text-emerald-900 shadow" : "text-slate-600 hover:text-slate-900"}`}
            >
              {m === "upload" ? "📹 Upload Video" : "🧪 Demo Swing Simulator"}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Camera view</p>
          <div className="grid grid-cols-2 gap-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`rounded-xl border-2 p-3 text-left transition ${view === v.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <p className="font-semibold text-slate-900">{v.name} <span className="text-xs text-slate-500">({v.id})</span></p>
                <p className="mt-1 text-xs leading-snug text-slate-600">{v.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-slate-800">Golfer</span>
          {(["right", "left"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHand(h)}
              className={`rounded-lg px-3 py-1.5 ${hand === h ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {h === "right" ? "Right-handed" : "Left-handed"}
            </button>
          ))}
        </div>

        {mode === "upload" ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? "border-emerald-600 bg-emerald-50" : "border-slate-300 hover:border-emerald-600 hover:bg-slate-50"}`}
          >
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
              className="hidden"
              data-testid="video-input"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <span className="text-3xl">⛳</span>
            <span className="mt-2 font-semibold text-slate-800">{file ? file.name : "Drop a swing video or click to browse"}</span>
            <span className="mt-1 text-xs text-slate-500">
              {file ? `${(file.size / 1e6).toFixed(1)} MB · click to replace` : ".mp4 / .mov / .webm · one full swing, 3–15 s · whole body in frame"}
            </span>
            <span className="mt-2 text-[11px] text-emerald-700">🔒 Processed 100% in your browser. Nothing is uploaded.</span>
          </label>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Synthetic test golfer</p>
            {DEMO_PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => { setProfile(p.id); setView(p.view); }}
                className={`w-full rounded-xl border-2 p-3 text-left transition ${profile === p.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <p className="font-semibold text-slate-900">{p.name} <span className="text-xs font-normal text-slate-500">· best in {p.view}</span></p>
                <p className="text-xs text-slate-600">{p.blurb}</p>
              </button>
            ))}
            <p className="text-[11px] text-slate-500">Generates MediaPipe-format landmarks, so this tests the checkpoint → metrics → faults → products pipeline without a real video.</p>
          </div>
        )}

        <button
          onClick={run}
          disabled={busy || (mode === "upload" && !videoUrl)}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-bold text-emerald-950 shadow transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Analyzing…" : mode === "demo" ? "Analyze Demo Swing →" : "Analyze My Swing →"}
        </button>

        {(busy || phase === "done") && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex justify-between text-xs text-slate-600">
              <span>{phase === "done" ? "Analysis complete ✓" : status}</span>
              {phase === "scanning" && <span className="tabular-nums">{progress.done}/{progress.total} · {pct}%</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-emerald-600 transition-all ${phase === "loading" || phase === "analyzing" ? "animate-pulse" : ""}`}
                style={{ width: `${phase === "done" ? 100 : phase === "scanning" ? pct : phase === "analyzing" ? 100 : 15}%` }}
              />
            </div>
            {phase === "scanning" && (
              <div className="flex items-center gap-3">
                <canvas ref={previewRef} className="h-24 rounded-md bg-slate-900" />
                <p className="text-xs text-slate-500">Golfer found in {progress.detected} of {progress.done} frames scanned</p>
              </div>
            )}
            {busy && (
              <button onClick={reset} className="text-xs text-slate-500 underline hover:text-slate-800">Cancel</button>
            )}
          </div>
        )}

        {error && (
          <div className="whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1 text-xs">{error}</p>
            {mode === "upload" && (
              <button onClick={() => setMode("demo")} className="mt-2 rounded-lg bg-rose-700 px-3 py-1 text-xs font-semibold text-white">
                Try the Demo Swing Simulator
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 2: player */}
      <section ref={playerBoxRef} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Step 2</p>
          <h2 className="text-xl font-bold text-slate-900">Pose tracking & checkpoints</h2>
        </div>
        {mode === "upload" && !videoUrl ? (
          <div className="grid aspect-video place-items-center rounded-xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-8 text-center text-emerald-50">
            <div>
              <p className="text-4xl">🏌️</p>
              <p className="mt-2 font-semibold">Your swing video will appear here</p>
              <p className="mt-1 text-sm text-emerald-200">No video handy? Switch to the Demo Swing Simulator.</p>
            </div>
          </div>
        ) : (
          <SwingPlayer
            key={mode === "demo" ? "demo" : videoUrl ?? "none"}
            kind={mode === "demo" ? "demo" : "video"}
            videoUrl={videoUrl}
            track={track}
            analysis={analysis}
            view={view}
            hand={hand}
            controlRef={playerRef}
          />
        )}

        {analysis && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {analysis.checkpoints.map((cp) => (
              <button
                key={cp.key}
                onClick={() => jump(cp.t)}
                className="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-emerald-600 hover:shadow"
                title={`Jump to ${cp.label}`}
              >
                {cp.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cp.thumb} alt={cp.label} className="aspect-[3/4] w-full bg-slate-900 object-cover" />
                ) : (
                  <div className="aspect-[3/4] w-full bg-slate-200" />
                )}
                <div className="p-2">
                  <p className="text-xs font-semibold text-slate-900 group-hover:text-emerald-800">{cp.label}</p>
                  <p className="text-[11px] tabular-nums text-slate-500">{cp.t.toFixed(2)}s · jump ↗</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {analysis && (
        <div className="lg:col-span-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-700">Step 3 · Your report</p>
          <Results analysis={analysis} />
        </div>
      )}
    </div>
  );
}

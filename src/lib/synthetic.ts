import type { Handedness, Lm, PoseFrame, PoseTrack, View } from "./types";

/**
 * Demo Swing Simulator: generates a parametric, right-handed golfer pose track
 * (33 MediaPipe-format landmarks per frame) so the checkpoint, metric, fault, and
 * product pipeline can run without a real video. Uploaded videos go through MediaPipe.
 */

type P = [number, number];
type Pose = Record<number, P>; // keys: 0,11,12,13,14,15,16,23,24,25,26,27,28
type Phase = "address" | "takeaway" | "top" | "delivery" | "impact" | "release" | "finish";
type PoseSet = Record<Phase, Pose>;

export const DEMO_W = 720;
export const DEMO_H = 960;
const FPS = 30;

export type DemoProfileId = "solid" | "slicer" | "flipper" | "swayer";
export const DEMO_PROFILES: { id: DemoProfileId; name: string; view: View; blurb: string }[] = [
  { id: "solid", name: "Solid Swing", view: "DTL", blurb: "Good tempo, posture and delivery, so you'll mostly see strengths." },
  { id: "slicer", name: "Over-the-Top Slicer", view: "DTL", blurb: "Throws the hands out in transition and early-extends. Best viewed down-the-line." },
  { id: "flipper", name: "Caster + Chicken Wing", view: "FO", blurb: "Hands behind at impact and lead arm folds. Best viewed face-on." },
  { id: "swayer", name: "Swayer, Rushed Tempo", view: "FO", blurb: "Slides off the ball with a quick 1.5:1 tempo. Best viewed face-on." },
];

const clone = (p: Pose): Pose => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [v[0], v[1]]])) as Pose;

function basePoses(view: View): PoseSet {
  if (view === "FO") {
    const legs = { 25: [0.56, 0.72], 26: [0.44, 0.72], 27: [0.57, 0.88], 28: [0.43, 0.88] } as Pose;
    return {
      address: { 0: [0.5, 0.25], 11: [0.565, 0.34], 12: [0.435, 0.35], 13: [0.545, 0.48], 14: [0.47, 0.49], 15: [0.515, 0.61], 16: [0.505, 0.63], 23: [0.545, 0.56], 24: [0.455, 0.56], ...legs },
      takeaway: { 0: [0.5, 0.25], 11: [0.54, 0.345], 12: [0.44, 0.345], 13: [0.49, 0.42], 14: [0.44, 0.44], 15: [0.425, 0.49], 16: [0.415, 0.51], 23: [0.54, 0.56], 24: [0.457, 0.56], ...legs },
      top: { 0: [0.495, 0.255], 11: [0.5, 0.36], 12: [0.43, 0.33], 13: [0.4425, 0.285], 14: [0.4, 0.3], 15: [0.385, 0.21], 16: [0.37, 0.19], 23: [0.535, 0.56], 24: [0.46, 0.555], 25: [0.54, 0.72], 26: [0.44, 0.72], 27: [0.57, 0.88], 28: [0.43, 0.88] },
      delivery: { 0: [0.5, 0.255], 11: [0.56, 0.34], 12: [0.44, 0.36], 13: [0.5, 0.42], 14: [0.45, 0.45], 15: [0.435, 0.5], 16: [0.425, 0.51], 23: [0.56, 0.56], 24: [0.47, 0.56], ...legs },
      impact: { 0: [0.5, 0.26], 11: [0.57, 0.335], 12: [0.45, 0.37], 13: [0.56, 0.48], 14: [0.49, 0.5], 15: [0.545, 0.61], 16: [0.535, 0.63], 23: [0.565, 0.555], 24: [0.48, 0.56], 25: [0.57, 0.72], 26: [0.46, 0.72], 27: [0.57, 0.88], 28: [0.43, 0.88] },
      release: { 0: [0.505, 0.26], 11: [0.575, 0.34], 12: [0.47, 0.37], 13: [0.6, 0.45], 14: [0.55, 0.47], 15: [0.62, 0.55], 16: [0.615, 0.56], 23: [0.57, 0.555], 24: [0.49, 0.56], 25: [0.575, 0.72], 26: [0.47, 0.72], 27: [0.57, 0.88], 28: [0.435, 0.875] },
      finish: { 0: [0.53, 0.25], 11: [0.56, 0.34], 12: [0.5, 0.33], 13: [0.62, 0.27], 14: [0.57, 0.28], 15: [0.6, 0.2], 16: [0.59, 0.19], 23: [0.57, 0.55], 24: [0.52, 0.55], 25: [0.575, 0.72], 26: [0.52, 0.72], 27: [0.57, 0.88], 28: [0.45, 0.86] },
    };
  }
  const legs = { 25: [0.44, 0.72], 26: [0.45, 0.72], 27: [0.4, 0.88], 28: [0.42, 0.88] } as Pose;
  return {
    address: { 0: [0.56, 0.3], 11: [0.5, 0.36], 12: [0.51, 0.37], 13: [0.52, 0.49], 14: [0.53, 0.5], 15: [0.55, 0.62], 16: [0.555, 0.63], 23: [0.36, 0.56], 24: [0.37, 0.56], ...legs },
    takeaway: { 0: [0.56, 0.3], 11: [0.51, 0.375], 12: [0.49, 0.36], 13: [0.5, 0.4], 14: [0.48, 0.41], 15: [0.52, 0.42], 16: [0.515, 0.425], 23: [0.36, 0.56], 24: [0.37, 0.56], ...legs },
    top: { 0: [0.56, 0.3], 11: [0.52, 0.38], 12: [0.48, 0.35], 13: [0.48, 0.29], 14: [0.42, 0.3], 15: [0.44, 0.2], 16: [0.43, 0.19], 23: [0.36, 0.56], 24: [0.38, 0.56], ...legs },
    delivery: { 0: [0.56, 0.3], 11: [0.51, 0.375], 12: [0.5, 0.365], 13: [0.47, 0.42], 14: [0.45, 0.45], 15: [0.45, 0.5], 16: [0.445, 0.505], 23: [0.365, 0.56], 24: [0.385, 0.56], ...legs },
    impact: { 0: [0.56, 0.3], 11: [0.5, 0.37], 12: [0.52, 0.38], 13: [0.53, 0.49], 14: [0.54, 0.5], 15: [0.55, 0.61], 16: [0.555, 0.62], 23: [0.365, 0.555], 24: [0.385, 0.555], ...legs },
    release: { 0: [0.555, 0.3], 11: [0.49, 0.36], 12: [0.51, 0.37], 13: [0.54, 0.45], 14: [0.55, 0.46], 15: [0.58, 0.52], 16: [0.585, 0.53], 23: [0.38, 0.555], 24: [0.4, 0.555], ...legs },
    finish: { 0: [0.5, 0.25], 11: [0.47, 0.33], 12: [0.45, 0.32], 13: [0.46, 0.24], 14: [0.48, 0.25], 15: [0.45, 0.18], 16: [0.44, 0.17], 23: [0.4, 0.55], 24: [0.42, 0.55], 25: [0.44, 0.72], 26: [0.47, 0.73], 27: [0.4, 0.88], 28: [0.44, 0.86] },
  };
}

function applyProfile(view: View, profile: DemoProfileId, ps: PoseSet): PoseSet {
  const p: PoseSet = Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, clone(v)])) as PoseSet;
  const set = (ph: Phase, vals: Pose) => Object.assign(p[ph], vals);
  if (profile === "slicer") {
    if (view === "DTL") {
      set("delivery", { 13: [0.56, 0.38], 14: [0.54, 0.41], 15: [0.62, 0.44], 16: [0.615, 0.445] });
      set("impact", { 0: [0.55, 0.28], 11: [0.49, 0.35], 12: [0.51, 0.355], 23: [0.43, 0.55], 24: [0.45, 0.55], 15: [0.57, 0.6], 16: [0.575, 0.61], 25: [0.47, 0.72], 26: [0.48, 0.72] });
      set("release", { 23: [0.44, 0.55], 24: [0.46, 0.55] });
    } else {
      set("impact", { 23: [0.52, 0.56], 24: [0.435, 0.56], 0: [0.49, 0.26] });
    }
  }
  if (profile === "flipper") {
    if (view === "FO") {
      set("delivery", { 15: [0.47, 0.54], 16: [0.46, 0.55], 13: [0.52, 0.45] });
      set("impact", { 15: [0.475, 0.62], 16: [0.465, 0.63], 13: [0.52, 0.49], 14: [0.46, 0.5], 23: [0.545, 0.56], 24: [0.455, 0.56] });
      set("release", { 13: [0.62, 0.42], 15: [0.56, 0.5], 16: [0.555, 0.51], 14: [0.53, 0.47] });
    } else {
      set("impact", { 23: [0.42, 0.555], 24: [0.44, 0.555] });
    }
  }
  if (profile === "swayer" && view === "FO") {
    set("top", { 0: [0.455, 0.255], 11: [0.46, 0.36], 12: [0.39, 0.33], 13: [0.4025, 0.285], 14: [0.36, 0.3], 15: [0.345, 0.21], 16: [0.33, 0.19], 23: [0.47, 0.56], 24: [0.39, 0.56], 25: [0.5, 0.72], 26: [0.41, 0.72] });
  }
  return p;
}

interface Seg { to: Phase; dur: number; ease?: "in" | "out" }

function timeline(profile: DemoProfileId): { hold: number; segs: Seg[]; tail: number } {
  const rushed = profile === "swayer";
  return {
    hold: 0.7,
    segs: [
      { to: "takeaway", dur: rushed ? 0.2 : 0.42, ease: "in" },
      { to: "top", dur: rushed ? 0.25 : 0.47 },
      { to: "top", dur: rushed ? 0 : 0.06 },
      { to: "delivery", dur: rushed ? 0.2 : 0.17 },
      { to: "impact", dur: rushed ? 0.13 : 0.11 },
      { to: "release", dur: 0.12 },
      { to: "finish", dur: 0.55, ease: "out" },
    ],
    tail: 0.8,
  };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function expand(pose: Pose, rand: () => number): Lm[] {
  const out: Lm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0.99 }));
  const j = () => (rand() - 0.5) * 0.003;
  for (const [k, [x, y]] of Object.entries(pose)) out[+k] = { x: x + j(), y: y + j(), v: 0.99 };
  const nose = out[0];
  [[1, -0.008, -0.01], [2, -0.012, -0.01], [3, -0.016, -0.01], [4, 0.008, -0.01], [5, 0.012, -0.01], [6, 0.016, -0.01], [7, -0.022, -0.005], [8, 0.022, -0.005], [9, -0.006, 0.012], [10, 0.006, 0.012]]
    .forEach(([i, dx, dy]) => (out[i] = { x: nose.x + dx, y: nose.y + dy, v: 0.99 }));
  [[17, 15], [19, 15], [21, 15], [18, 16], [20, 16], [22, 16]].forEach(([i, w], n) => (out[i] = { x: out[w].x + (n % 3 - 1) * 0.006, y: out[w].y + 0.015, v: 0.9 }));
  [[29, 27, -0.012, 0.01], [31, 27, 0.02, 0.012], [30, 28, -0.012, 0.01], [32, 28, 0.02, 0.012]].forEach(([i, a, dx, dy]) => (out[i] = { x: out[a].x + dx, y: out[a].y + dy, v: 0.95 }));
  return out;
}

function mirror(lm: Lm[]): Lm[] {
  const swap = (i: number) => {
    if (i === 0) return 0;
    if (i >= 1 && i <= 10) return i <= 3 ? i + 3 : i <= 6 ? i - 3 : i % 2 === 1 ? i + 1 : i - 1;
    return i % 2 === 1 ? i + 1 : i - 1;
  };
  return lm.map((_, i) => ({ ...lm[swap(i)], x: 1 - lm[swap(i)].x }));
}

export function generateSyntheticTrack(profile: DemoProfileId, view: View, hand: Handedness): PoseTrack {
  const poses = applyProfile(view, profile, basePoses(view));
  const tl = timeline(profile);
  const keys: { t: number; pose: Pose; ease?: "in" | "out" }[] = [{ t: 0, pose: poses.address }, { t: tl.hold, pose: poses.address }];
  let t = tl.hold;
  for (const s of tl.segs) { t += s.dur; keys.push({ t, pose: poses[s.to], ease: s.ease }); }
  const duration = t + tl.tail;
  const rand = rng(42 + profile.length * 7 + (view === "FO" ? 3 : 0));
  const frames: PoseFrame[] = [];
  for (let i = 0; i <= Math.round(duration * FPS); i++) {
    const ft = i / FPS;
    const k = keys.findIndex((kk) => kk.t >= ft);
    let pose: Pose;
    if (k <= 0) pose = keys[k === 0 ? 0 : keys.length - 1].pose;
    else {
      const a = keys[k - 1], b = keys[k];
      let w = b.t === a.t ? 1 : (ft - a.t) / (b.t - a.t);
      if (b.ease === "in") w = w * w;
      if (b.ease === "out") w = 1 - (1 - w) * (1 - w);
      pose = {} as Pose;
      for (const key of Object.keys(b.pose)) {
        const pa = a.pose[+key], pb = b.pose[+key];
        pose[+key] = [pa[0] + (pb[0] - pa[0]) * w, pa[1] + (pb[1] - pa[1]) * w];
      }
    }
    let lm = expand(pose, rand);
    if (hand === "left") lm = mirror(lm);
    frames.push({ t: ft, lm });
  }
  return { frames, width: DEMO_W, height: DEMO_H, duration, source: "synthetic", failedFrames: 0 };
}

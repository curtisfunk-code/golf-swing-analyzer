import type { Handedness, Lm } from "./types";

export const IDX = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
} as const;

/** Body connections (subset of MediaPipe POSE_CONNECTIONS, face omitted). */
export const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
  [15, 17], [15, 19], [17, 19], [16, 18], [16, 20], [18, 20],
];

export interface Sides {
  leadShoulder: number; trailShoulder: number;
  leadElbow: number; trailElbow: number;
  leadWrist: number; trailWrist: number;
  leadHip: number; trailHip: number;
  leadAnkle: number; trailAnkle: number;
}

/** Right-handed golfers lead with their LEFT side. */
export function sides(hand: Handedness): Sides {
  const rh = hand === "right";
  return {
    leadShoulder: rh ? IDX.lShoulder : IDX.rShoulder,
    trailShoulder: rh ? IDX.rShoulder : IDX.lShoulder,
    leadElbow: rh ? IDX.lElbow : IDX.rElbow,
    trailElbow: rh ? IDX.rElbow : IDX.lElbow,
    leadWrist: rh ? IDX.lWrist : IDX.rWrist,
    trailWrist: rh ? IDX.rWrist : IDX.lWrist,
    leadHip: rh ? IDX.lHip : IDX.rHip,
    trailHip: rh ? IDX.rHip : IDX.lHip,
    leadAnkle: rh ? IDX.lAnkle : IDX.rAnkle,
    trailAnkle: rh ? IDX.rAnkle : IDX.lAnkle,
  };
}

export interface V2 { x: number; y: number }

export const mid = (a: V2, b: V2): V2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Angle ABC in degrees (at vertex B). */
export function jointAngle(a: V2, b: V2, c: V2): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (d === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Convert a normalized landmark to "square" space (x scaled by aspect) so angles are true. */
export const sq = (l: Lm, aspect: number): V2 => ({ x: l.x * aspect, y: l.y });

export function nearestFrameIndex(times: number[], t: number): number {
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (times[m] < t) lo = m + 1;
    else hi = m;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) < Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

import { CONNECTIONS, IDX, sides } from "./pose";
import type { Handedness, Lm, View } from "./types";

export function drawSkeleton(
  ctx: CanvasRenderingContext2D, lm: Lm[], w: number, h: number,
  opts: { hand?: Handedness; handPath?: { x: number; y: number }[]; pathUpTo?: number; scale?: number } = {},
) {
  const s = opts.scale ?? Math.max(1, w / 640);
  const S = sides(opts.hand ?? "right");
  const lead = new Set([S.leadShoulder, S.leadElbow, S.leadWrist]);

  if (opts.handPath && opts.handPath.length > 1) {
    const upto = Math.min(opts.handPath.length - 1, opts.pathUpTo ?? opts.handPath.length - 1);
    ctx.lineWidth = 2 * s; ctx.strokeStyle = "rgba(250, 204, 21, 0.25)";
    ctx.beginPath();
    opts.handPath.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
    ctx.stroke();
    ctx.lineWidth = 3 * s; ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) { const p = opts.handPath[i]; if (i) ctx.lineTo(p.x * w, p.y * h); else ctx.moveTo(p.x * w, p.y * h); }
    ctx.stroke();
  }

  ctx.lineCap = "round";
  for (const [a, b] of CONNECTIONS) {
    const p = lm[a], q = lm[b];
    if (!p || !q || (p.v ?? 1) < 0.3 || (q.v ?? 1) < 0.3) continue;
    const isLead = lead.has(a) && lead.has(b);
    ctx.strokeStyle = isLead ? "rgba(56, 189, 248, 0.95)" : "rgba(255,255,255,0.92)";
    ctx.lineWidth = (isLead ? 5 : 4) * s;
    ctx.shadowColor = "rgba(6, 78, 59, 0.9)"; ctx.shadowBlur = 4 * s;
    ctx.beginPath(); ctx.moveTo(p.x * w, p.y * h); ctx.lineTo(q.x * w, q.y * h); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (let i = 11; i < 33; i++) {
    const p = lm[i]; if (!p || (p.v ?? 1) < 0.3 || (i >= 17 && i <= 22) || i >= 29) continue;
    ctx.fillStyle = i === IDX.lHip || i === IDX.rHip ? "#f97316" : "#22c55e";
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "white"; ctx.lineWidth = 1.5 * s; ctx.stroke();
  }
  const n = lm[IDX.nose];
  if (n) { ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(n.x * w, n.y * h, 6 * s, 0, Math.PI * 2); ctx.fill(); }
}

/** Renders the Demo Swing Simulator golfer (body + club + range background). */
export function drawDemoScene(ctx: CanvasRenderingContext2D, lm: Lm[], w: number, h: number, view: View) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#bfe3f5"); g.addColorStop(0.55, "#e0f2fe"); g.addColorStop(0.56, "#3f8f4f"); g.addColorStop(1, "#1f5f32");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 8; i++) ctx.fillRect(0, h * 0.56 + i * h * 0.06, w, h * 0.03);
  ctx.fillStyle = "#14532d"; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.9, w * 0.25, h * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  const ball = view === "FO" ? { x: 0.5, y: 0.885 } : { x: 0.64, y: 0.885 };
  ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(ball.x * w, ball.y * h, 8, 0, Math.PI * 2); ctx.fill();

  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const limb = (a: number, b: number, width: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(P(a).x, P(a).y); ctx.lineTo(P(b).x, P(b).y); ctx.stroke();
  };
  const pants = "#334155", shirt = "#0f766e", skin = "#e7b98f";
  limb(23, 25, 34, pants); limb(25, 27, 28, pants); limb(24, 26, 34, pants); limb(26, 28, 28, pants);
  ctx.fillStyle = shirt; ctx.beginPath();
  [11, 12, 24, 23].forEach((i, k) => (k ? ctx.lineTo(P(i).x, P(i).y) : ctx.moveTo(P(i).x, P(i).y)));
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = shirt; ctx.lineWidth = 30; ctx.lineJoin = "round"; ctx.stroke();
  limb(11, 13, 20, shirt); limb(12, 14, 20, shirt); limb(13, 15, 16, skin); limb(14, 16, 16, skin);
  const nose = P(0); ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(nose.x, nose.y, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.arc(nose.x, nose.y - 14, 30, Math.PI, 0); ctx.fill();

  // Club: from hands, continuing the shoulder→hands direction
  const hands = { x: (P(15).x + P(16).x) / 2, y: (P(15).y + P(16).y) / 2 };
  const sh = { x: (P(11).x + P(12).x) / 2, y: (P(11).y + P(12).y) / 2 };
  const d = Math.hypot(hands.x - sh.x, hands.y - sh.y) || 1;
  const len = h * 0.3;
  const end = { x: hands.x + ((hands.x - sh.x) / d) * len, y: hands.y + ((hands.y - sh.y) / d) * len };
  ctx.strokeStyle = "#111827"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hands.x, hands.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.arc(end.x, end.y, 9, 0, Math.PI * 2); ctx.fill();
}

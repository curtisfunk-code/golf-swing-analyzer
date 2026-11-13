import { IDX, dist, jointAngle, mid, sides, sq, type V2 } from "./pose";
import type {
  Analysis, Checkpoint, CheckpointKey, Finding, Handedness, Lm, Metric, PoseTrack, Status, View,
} from "./types";

const N_LM = 33;
const CP_LABELS: Record<CheckpointKey, string> = {
  address: "Address",
  top: "Top of Backswing",
  impact: "Impact",
  finish: "Follow-Through",
};

/** Fill missing frames by linear interpolation, then apply a centered moving average. */
function prepare(track: PoseTrack): { lms: Lm[][]; times: number[]; detectedRatio: number } {
  const frames = track.frames;
  const n = frames.length;
  const valid = frames.map((f) => !!f.lm && f.lm.length >= N_LM);
  const detected = valid.filter(Boolean).length;
  if (detected < 5) throw new Error("No golfer detected in enough frames. Try a clearer, well-lit video with your whole body in frame.");

  const filled: Lm[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (valid[i]) { filled[i] = frames[i].lm!.slice(0, N_LM); continue; }
    let p = i - 1; while (p >= 0 && !valid[p]) p--;
    let q = i + 1; while (q < n && !valid[q]) q++;
    if (p < 0) filled[i] = frames[q].lm!.slice(0, N_LM);
    else if (q >= n) filled[i] = frames[p].lm!.slice(0, N_LM);
    else {
      const a = frames[p].lm!, b = frames[q].lm!;
      const w = (i - p) / (q - p);
      filled[i] = Array.from({ length: N_LM }, (_, k) => ({
        x: a[k].x + (b[k].x - a[k].x) * w,
        y: a[k].y + (b[k].y - a[k].y) * w,
        v: Math.min(a[k].v ?? 1, b[k].v ?? 1),
      }));
    }
  }
  const W = 2; // window = 5
  const lms: Lm[][] = filled.map((_, i) => {
    const lo = Math.max(0, i - W), hi = Math.min(n - 1, i + W);
    return Array.from({ length: N_LM }, (_, k) => {
      let sx = 0, sy = 0;
      for (let j = lo; j <= hi; j++) { sx += filled[j][k].x; sy += filled[j][k].y; }
      const c = hi - lo + 1;
      return { x: sx / c, y: sy / c, v: filled[i][k].v };
    });
  });
  return { lms, times: frames.map((f) => f.t), detectedRatio: detected / n };
}

const argBy = (lo: number, hi: number, f: (i: number) => number, better: (a: number, b: number) => boolean) => {
  let best = lo;
  for (let i = lo; i <= hi; i++) if (better(f(i), f(best))) best = i;
  return best;
};

function grade(value: number, good: (v: number) => boolean, ok: (v: number) => boolean): Status {
  return good(value) ? "good" : ok(value) ? "ok" : "fault";
}

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");

export function analyzeSwing(track: PoseTrack, view: View, hand: Handedness): Analysis {
  const { lms, times, detectedRatio } = prepare(track);
  const n = lms.length;
  const aspect = track.width / track.height;
  const S = sides(hand);
  const warnings: string[] = [];
  if (detectedRatio < 0.6) warnings.push(`Pose was only detected in ${Math.round(detectedRatio * 100)}% of frames, so results may be less reliable.`);
  if (n < 12) throw new Error("Video is too short to analyze. Record the full swing from address to finish.");

  const P = (i: number, k: number): V2 => sq(lms[i][k], aspect);
  const hands = (i: number) => mid(P(i, IDX.lWrist), P(i, IDX.rWrist));
  const hips = (i: number) => mid(P(i, IDX.lHip), P(i, IDX.rHip));
  const shoulders = (i: number) => mid(P(i, IDX.lShoulder), P(i, IDX.rShoulder));

  // Hand speed (square-normalized units per second)
  const speed = lms.map((_, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dt = times[b] - times[a] || 1e-3;
    return dist(hands(a), hands(b)) / dt;
  });
  const maxSp = Math.max(...speed);
  const peak = speed.indexOf(maxSp);

  // --- Checkpoint detection from wrist & hip kinematics ---
  let start = 0;
  for (let i = 0; i < n - 3; i++) {
    if (speed[i] > 0.15 * maxSp && speed[i + 1] > 0.15 * maxSp && speed[i + 2] > 0.15 * maxSp) { start = i; break; }
  }
  let address = Math.max(0, start - 2);
  let top = -1;
  if (peak > start) {
    // Top = middle of the "pause" plateau where the hands are at (or within 2% torso of) their highest point
    const tMin = argBy(start, peak, (i) => hands(i).y, (a, b) => a < b);
    const tol = 0.02 * (dist(shoulders(start), hips(start)) || 0.2);
    let a = tMin, b = tMin;
    while (a > start && hands(a - 1).y <= hands(tMin).y + tol) a--;
    while (b < peak && hands(b + 1).y <= hands(tMin).y + tol) b++;
    top = Math.round((a + b) / 2);
  }
  let impact = -1, finish = -1;
  if (top > address) {
    const span = Math.max(4, top - address);
    const hi = Math.min(n - 1, top + span);
    impact = argBy(top + 1 <= hi ? top + 1 : top, hi, (i) => hands(i).y, (a, b) => a > b);
    if (impact < n - 1) finish = argBy(impact + 1, n - 1, (i) => hands(i).y, (a, b) => a < b);
  }
  if (!(address < top && top < impact && impact < finish)) {
    warnings.push("Couldn't confidently find all four swing positions, so evenly spaced estimates are used. Make sure the clip shows one full swing from a still address to the finish.");
    address = Math.round(n * 0.1); top = Math.round(n * 0.45); impact = Math.round(n * 0.6); finish = Math.round(n * 0.85);
  }

  const scale = dist(shoulders(address), hips(address)) || 0.2;
  const travel = (hands(address).y - hands(top).y) / scale;
  if (travel < 0.6) warnings.push("Hands barely rose during the clip, so this may not be a full swing.");

  const checkpoints: Checkpoint[] = ([
    ["address", address], ["top", top], ["impact", impact], ["finish", finish],
  ] as [CheckpointKey, number][]).map(([key, i]) => ({ key, label: CP_LABELS[key], frameIndex: i, t: times[i] }));

  const metrics: Metric[] = [];

  // --- Tempo (both views) ---
  const back = times[top] - times[address];
  const down = Math.max(1e-3, times[impact] - times[top]);
  const ratio = back / down;
  const tStatus = grade(ratio, (v) => v >= 2.5 && v <= 3.6, (v) => v >= 2.0 && v <= 4.3);
  metrics.push({
    id: "tempo", label: "Tempo ratio (backswing : downswing)", value: ratio,
    display: `${fmt(ratio, 1)} : 1 (${fmt(back, 2)}s / ${fmt(down, 2)}s)`, ideal: "≈ 3 : 1 (2.5 to 3.6)",
    status: tStatus, severity: Math.min(1, Math.abs(ratio - 3) / 3) + (tStatus === "fault" ? 0.2 : 0), faultId: "poor_tempo",
    strengthTitle: "Smooth, tour-like tempo",
    strengthDetail: `Your backswing-to-downswing ratio is ${fmt(ratio, 1)}:1, right around the tour average of 3:1. That rhythm helps your sequencing repeat.`,
    faultTitle: ratio < 3 ? "Rushed tempo" : "Slow or decelerating tempo",
    faultDetail: ratio < 3
      ? `Ratio is ${fmt(ratio, 1)}:1. Your backswing is short or quick compared with the downswing, so let the club finish going back before you start down.`
      : `Ratio is ${fmt(ratio, 1)}:1. Your downswing takes long compared with the backswing, which often means you slow down into the ball.`,
  });

  // --- Head stability (both views) ---
  const headMove = dist(P(address, IDX.nose), P(impact, IDX.nose)) / scale;
  const hStatus = grade(headMove, (v) => v < 0.15, (v) => v < 0.3);
  metrics.push({
    id: "head", label: "Head movement (address → impact)", value: headMove,
    display: `${fmt(headMove)} torso-lengths`, ideal: "< 0.15",
    status: hStatus, severity: Math.min(1, headMove / 0.6) * 0.8, faultId: "head_movement",
    strengthTitle: "Quiet, stable head",
    strengthDetail: `Your head moved only ${fmt(headMove)} torso-lengths from address to impact, which keeps the low point consistent.`,
    faultTitle: "Head moving off the ball",
    faultDetail: `Your head moved ${fmt(headMove)} torso-lengths between address and impact (ideal is under 0.15).`,
  });

  if (view === "DTL") {
    const ballSign = Math.sign(hands(address).x - hips(address).x) || 1;
    const tilt = (i: number) => {
      const h = hips(i), s = shoulders(i);
      return (Math.atan2((s.x - h.x) * ballSign, h.y - s.y) * 180) / Math.PI;
    };
    const tiltA = tilt(address), tiltI = tilt(impact);

    const sStatus = grade(tiltA, (v) => v >= 25 && v <= 45, (v) => v >= 18 && v <= 50);
    metrics.push({
      id: "setup_tilt", label: "Setup: forward spine tilt", value: tiltA,
      display: `${fmt(tiltA, 0)}°`, ideal: "25° to 45°",
      status: sStatus, severity: Math.min(1, Math.abs(tiltA - 35) / 25) * 0.8, faultId: "setup_alignment",
      strengthTitle: "Athletic setup posture",
      strengthDetail: `You tilt forward ${fmt(tiltA, 0)}° from the hips at address, which gives your arms room to hang and swing on plane.`,
      faultTitle: tiltA < 30 ? "Too upright at address" : "Too bent over at address",
      faultDetail: `Your forward tilt at address is ${fmt(tiltA, 0)}° (ideal is 25° to 45°).`,
    });

    const loss = tiltA - tiltI;
    const pStatus = grade(loss, (v) => Math.abs(v) < 6, (v) => v < 10);
    metrics.push({
      id: "spine", label: "Spine angle retention (address → impact)", value: loss,
      display: `${loss >= 0 ? "-" : "+"}${fmt(Math.abs(loss), 1)}°`, ideal: "within ±6°",
      status: pStatus, severity: Math.min(1, loss / 20), faultId: "loss_of_posture",
      strengthTitle: "Holding your spine angle",
      strengthDetail: `Your spine angle changed only ${fmt(Math.abs(loss), 1)}° from address to impact. Staying in posture this well is something many amateurs struggle with.`,
      faultTitle: "Standing up through impact",
      faultDetail: `You lose ${fmt(loss, 1)}° of forward tilt by impact (ideal is under 6°).`,
    });

    const ee = ((hips(impact).x - hips(address).x) * ballSign) / scale;
    const eStatus = grade(ee, (v) => v < 0.06, (v) => v < 0.12);
    metrics.push({
      id: "early_ext", label: "Hip depth: movement toward ball (early-extension proxy)", value: ee,
      display: `${fmt(ee)} torso-lengths`, ideal: "< 0.06",
      status: eStatus, severity: Math.min(1, ee / 0.3) + 0.1, faultId: "early_extension",
      strengthTitle: "Keeping your hip depth",
      strengthDetail: `Your hips stayed back (${fmt(ee)} torso-lengths of forward movement), giving your arms room to swing through.`,
      faultTitle: "Early extension: hips move toward the ball",
      faultDetail: `Your hips move ${fmt(ee)} torso-lengths toward the ball by impact (ideal is under 0.06).`,
    });

    // Over-the-top proxy: compare hand x when crossing shoulder height in backswing vs. downswing
    const yRef = shoulders(address).y;
    const cross = (lo: number, hi: number, rising: boolean): number | null => {
      for (let i = lo; i < hi; i++) {
        const a = hands(i).y, b = hands(i + 1).y;
        if (rising ? a >= yRef && b < yRef : a <= yRef && b > yRef) {
          const w = (a - yRef) / (a - b || 1e-6);
          return hands(i).x + (hands(i + 1).x - hands(i).x) * w;
        }
      }
      return null;
    };
    const xb = cross(address, top, true), xd = cross(top, impact, false);
    if (xb !== null && xd !== null) {
      const ott = ((xd - xb) * ballSign) / scale;
      const oStatus = grade(ott, (v) => v < 0.02, (v) => v < 0.1);
      metrics.push({
        id: "ott", label: "Downswing hand path vs. backswing (over-the-top proxy)", value: ott,
        display: `${ott >= 0 ? "+" : ""}${fmt(ott)} (+ = outside)`, ideal: "≤ 0 (on plane or inside)",
        status: oStatus, severity: Math.min(1, ott / 0.3) + 0.2, faultId: "over_the_top",
        strengthTitle: "Delivering the club from the inside",
        strengthDetail: "In transition your hands drop inside your backswing path, which is the shallow move that produces a draw-friendly path.",
        faultTitle: "Over the top in transition",
        faultDetail: `At shoulder height, your hands come down ${fmt(ott)} torso-lengths outside your backswing path, which is a common slice pattern.`,
      });
    } else {
      warnings.push("Couldn't measure the over-the-top check because your hands never clearly crossed shoulder height.");
    }
  } else {
    // FACE-ON
    const targetSign = Math.sign(P(address, S.leadShoulder).x - P(address, S.trailShoulder).x) || 1;

    const stance = dist(P(address, IDX.lAnkle), P(address, IDX.rAnkle)) / (dist(P(address, IDX.lShoulder), P(address, IDX.rShoulder)) || 1e-3);
    const stStatus = grade(stance, (v) => v >= 0.85 && v <= 1.7, (v) => v >= 0.7 && v <= 2.0);
    metrics.push({
      id: "stance", label: "Setup: stance width / shoulder width", value: stance,
      display: `${fmt(stance)}×`, ideal: "0.85× to 1.7×",
      status: stStatus, severity: Math.min(1, Math.abs(stance - 1.2) / 1.2) * 0.8, faultId: "setup_alignment",
      strengthTitle: "Solid, balanced stance",
      strengthDetail: `Your stance is ${fmt(stance)}× your shoulder width, a stable base for turning.`,
      faultTitle: stance < 1 ? "Stance too narrow" : "Stance too wide",
      faultDetail: `Your stance is ${fmt(stance)}× your shoulder width (ideal is 0.85× to 1.7× depending on club).`,
    });

    const sway = (-(hips(top).x - hips(address).x) * targetSign) / scale;
    const swStatus = grade(Math.abs(sway), (v) => v < 0.08, (v) => v < 0.15);
    metrics.push({
      id: "sway", label: "Backswing hip sway (lateral slide)", value: sway,
      display: `${fmt(Math.abs(sway))} torso-lengths ${sway >= 0 ? "away from target" : "toward target"}`, ideal: "< 0.08",
      status: swStatus, severity: Math.min(1, Math.abs(sway) / 0.3) + 0.1, faultId: "sway",
      strengthTitle: "Turning, not sliding",
      strengthDetail: `Your hips stayed centered in the backswing (${fmt(Math.abs(sway))} torso-lengths of slide), so you're rotating around a stable center.`,
      faultTitle: sway >= 0 ? "Swaying off the ball" : "Reverse pivot",
      faultDetail: `Your hips slide ${fmt(Math.abs(sway))} torso-lengths ${sway >= 0 ? "away from" : "toward"} the target in the backswing (ideal is under 0.08).`,
    });

    const leadTop = jointAngle(P(top, S.leadShoulder), P(top, S.leadElbow), P(top, S.leadWrist));
    const laStatus = grade(leadTop, (v) => v >= 155, (v) => v >= 135);
    metrics.push({
      id: "lead_arm_top", label: "Lead-arm extension at top", value: leadTop,
      display: `${fmt(leadTop, 0)}°`, ideal: "≥ 155°",
      status: laStatus, severity: Math.min(1, (180 - leadTop) / 80), faultId: "bent_lead_arm",
      strengthTitle: "Wide, extended lead arm at the top",
      strengthDetail: `Your lead arm is ${fmt(leadTop, 0)}° straight at the top, which gives you a wide arc and stored width.`,
      faultTitle: "Lead arm collapsing at the top",
      faultDetail: `Your lead elbow is bent to ${fmt(leadTop, 0)}° at the top (ideal is at least 155°).`,
    });

    const shift = ((hips(impact).x - hips(address).x) * targetSign) / scale;
    const wsStatus = grade(shift, (v) => v >= 0.06, (v) => v >= 0);
    metrics.push({
      id: "weight_shift", label: "Hip shift toward target at impact", value: shift,
      display: `${shift >= 0 ? "+" : ""}${fmt(shift)} torso-lengths`, ideal: "≥ +0.06",
      status: wsStatus, severity: Math.min(1, (0.06 - shift) / 0.25), faultId: "sway",
      strengthTitle: "Great weight shift into the lead side",
      strengthDetail: `Your hips move ${fmt(shift)} torso-lengths toward the target by impact, so you're striking with pressure on your lead side.`,
      faultTitle: "Hanging back at impact",
      faultDetail: `Your hips are ${fmt(shift)} torso-lengths from where they started at address. Get them moving toward the target before impact.`,
    });

    const lead = ((hands(impact).x - hips(impact).x) * targetSign) / scale;
    const csStatus = grade(lead, (v) => v >= 0.04, (v) => v >= -0.04);
    metrics.push({
      id: "hands_impact", label: "Hands vs. hips at impact (shaft-lean / casting proxy)", value: lead,
      display: `${lead >= 0 ? "+" : ""}${fmt(lead)} (+ = hands ahead)`, ideal: "≥ +0.04",
      status: csStatus, severity: Math.min(1, (0.04 - lead) / 0.25) + 0.15, faultId: "casting",
      strengthTitle: "Hands leading at impact",
      strengthDetail: "Your hands are ahead of your hip center at impact. That forward shaft lean compresses the ball.",
      faultTitle: "Casting / flipping: hands behind at impact",
      faultDetail: `Your hands are ${fmt(Math.abs(lead))} torso-lengths behind your hip center at impact, a sign of early release.`,
    });

    let rel = impact;
    while (rel < finish && times[rel] < times[impact] + 0.1) rel++;
    const leadRel = jointAngle(P(rel, S.leadShoulder), P(rel, S.leadElbow), P(rel, S.leadWrist));
    const cwStatus = grade(leadRel, (v) => v >= 160, (v) => v >= 145);
    metrics.push({
      id: "chicken_wing", label: "Lead-arm extension just after impact", value: leadRel,
      display: `${fmt(leadRel, 0)}°`, ideal: "≥ 160°",
      status: cwStatus, severity: Math.min(1, (175 - leadRel) / 60), faultId: "chicken_wing",
      strengthTitle: "Full extension through the ball",
      strengthDetail: `Both arms extend (lead arm ${fmt(leadRel, 0)}°) after impact, which gives you a wide, powerful release.`,
      faultTitle: "Chicken wing after impact",
      faultDetail: `Your lead elbow folds to ${fmt(leadRel, 0)}° just after impact (ideal is at least 160°).`,
    });

    const bal = ((hips(finish).x - P(finish, S.leadAnkle).x) * targetSign) / scale;
    const bStatus = grade(bal, (v) => v >= -0.2, (v) => v >= -0.35);
    metrics.push({
      id: "finish", label: "Finish balance (hips over lead foot)", value: bal,
      display: `${fmt(bal)} torso-lengths`, ideal: "≥ -0.20",
      status: bStatus === "fault" ? "ok" : bStatus, severity: 0, // informational: never a top fault on its own
      strengthTitle: "Balanced, committed finish",
      strengthDetail: "You finish with your hips stacked over your lead foot, which shows full rotation and a complete weight transfer.",
      faultTitle: "Falling back at the finish", faultDetail: "",
    });
  }

  // --- Strengths & faults ---
  const faultMap = new Map<string, Finding>();
  metrics.filter((m) => m.status === "fault").sort((a, b) => b.severity - a.severity).forEach((m) => {
    const key = m.faultId ?? m.id;
    if (!faultMap.has(key)) faultMap.set(key, { metricId: m.id, title: m.faultTitle, detail: m.faultDetail, faultId: m.faultId, severity: m.severity });
  });
  const faults = [...faultMap.values()].slice(0, 3);

  const good = metrics.filter((m) => m.status === "good");
  const strengths: Finding[] = good.slice(0, 3).map((m) => ({ metricId: m.id, title: m.strengthTitle, detail: m.strengthDetail, severity: 0 }));
  if (strengths.length < 2) {
    metrics.filter((m) => m.status === "ok").slice(0, 2 - strengths.length).forEach((m) => {
      strengths.push({ metricId: m.id, title: `${m.label}: in a playable range`, detail: `${m.display} (ideal ${m.ideal}). Close to ideal, so keep refining it.`, severity: 0 });
    });
  }

  return {
    view, checkpoints, metrics, strengths, faults, warnings, detectedRatio,
    handPath: lms.map((l) => mid(l[IDX.lWrist], l[IDX.rWrist])),
  };
}

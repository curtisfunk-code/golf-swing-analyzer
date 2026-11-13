import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Lm, PoseFrame, PoseTrack } from "./types";

/** Keep in sync with the @mediapipe/tasks-vision version in package.json. */
export const MP_VERSION = "1.2.3";
const SOURCES = [
  {
    label: "official MediaPipe CDN",
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
  { label: "self-hosted fallback (/public)", wasm: "/mediapipe/wasm", model: "/models/pose_landmarker_lite.task" },
];

let cached: { landmarker: PoseLandmarker; source: string; delegate: string } | null = null;
let lastTs = 0;
const nextTs = () => (lastTs = Math.max(lastTs + 1, Math.floor(performance.now())));

export async function loadPoseLandmarker(onStatus?: (msg: string) => void) {
  if (cached) return cached;
  const vision = await import("@mediapipe/tasks-vision");
  const errors: string[] = [];
  for (const src of SOURCES) {
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        onStatus?.(`Loading PoseLandmarker (lite) from ${src.label} [${delegate}]…`);
        const fileset = await vision.FilesetResolver.forVisionTasks(src.wasm);
        const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: src.model, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        cached = { landmarker, source: src.label, delegate };
        return cached;
      } catch (e) {
        errors.push(`${src.label}/${delegate}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  throw new Error(
    `Could not load MediaPipe Pose Landmarker. The CDN may be blocked by a firewall or ad-blocker, and the self-hosted fallback also failed. Try the Demo Swing Simulator in the meantime.\n${errors.join("\n")}`,
  );
}

function once(el: HTMLMediaElement, ev: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for video '${ev}'`)); }, timeoutMs);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("This video can't be decoded by your browser. iPhone HEVC .mov files often fail in Chrome, so re-export as H.264 MP4 or try Safari.")); };
    const cleanup = () => { clearTimeout(timer); el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

export interface ScanProgress {
  done: number;
  total: number;
  detected: number;
  preview?: { video: HTMLVideoElement; lm: Lm[] | null };
}

/** Frame-by-frame scan of a (local blob) video with MediaPipe. Nothing is uploaded. */
export async function scanVideo(
  url: string,
  landmarker: PoseLandmarker,
  onProgress: (p: ScanProgress) => void,
  signal?: { cancelled: boolean },
): Promise<PoseTrack> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await once(v, "loadedmetadata", 15000);
  let duration = v.duration;
  if (!Number.isFinite(duration)) {
    // MediaRecorder WebM files report Infinity until you seek to the end
    v.currentTime = 1e7;
    await once(v, "seeked", 8000).catch(() => undefined);
    duration = v.duration;
    v.currentTime = 0;
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Couldn't read the video duration.");
  if (!v.videoWidth) await once(v, "loadeddata", 8000);

  const MAX_FRAMES = 450;
  const step = Math.max(1 / 30, duration / MAX_FRAMES);
  const total = Math.max(1, Math.floor(duration / step));
  const frames: PoseFrame[] = [];
  let failed = 0, detected = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.cancelled) throw new Error("Scan cancelled.");
    const t = Math.min(duration - 0.001, i * step + 0.001);
    v.currentTime = t;
    try { await once(v, "seeked", 4000); } catch { failed++; frames.push({ t, lm: null }); continue; }
    let lm: Lm[] | null = null;
    try {
      const res = landmarker.detectForVideo(v, nextTs());
      const p = res.landmarks?.[0];
      if (p && p.length) { lm = p.map((q) => ({ x: q.x, y: q.y, z: q.z, v: q.visibility })); detected++; }
    } catch {
      failed++;
    }
    frames.push({ t, lm });
    onProgress({ done: i + 1, total, detected, preview: { video: v, lm } });
  }
  return { frames, width: v.videoWidth, height: v.videoHeight, duration, source: "video", failedFrames: failed };
}

/** Grab still frames at given times (for checkpoint thumbnails). */
export async function grabFrames(
  url: string,
  times: number[],
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, index: number) => void,
  thumbW = 320,
): Promise<string[]> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  await once(v, "loadedmetadata", 15000);
  const out: string[] = [];
  for (let i = 0; i < times.length; i++) {
    v.currentTime = Math.max(0.001, times[i]);
    await once(v, "seeked", 4000).catch(() => undefined);
    const w = thumbW, h = Math.round((thumbW * v.videoHeight) / (v.videoWidth || 1));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0, w, h);
    draw(ctx, w, h, i);
    out.push(c.toDataURL("image/jpeg", 0.8));
  }
  return out;
}

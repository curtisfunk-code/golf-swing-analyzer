export type View = "DTL" | "FO";
export type Handedness = "right" | "left";

export interface Lm {
  x: number; // normalized 0..1 (image width)
  y: number; // normalized 0..1 (image height)
  z?: number;
  v?: number; // visibility
}

export interface PoseFrame {
  t: number; // seconds
  lm: Lm[] | null;
}

export interface PoseTrack {
  frames: PoseFrame[];
  width: number;
  height: number;
  duration: number;
  source: "video" | "synthetic";
  failedFrames: number;
}

export type CheckpointKey = "address" | "top" | "impact" | "finish";

export interface Checkpoint {
  key: CheckpointKey;
  label: string;
  frameIndex: number;
  t: number;
  thumb?: string;
}

export type Status = "good" | "ok" | "fault";

export interface Metric {
  id: string;
  label: string;
  value: number;
  display: string;
  ideal: string;
  status: Status;
  severity: number; // 0..1, used to rank faults
  faultId?: string;
  strengthTitle: string;
  strengthDetail: string;
  faultTitle: string;
  faultDetail: string;
}

export interface Finding {
  metricId: string;
  title: string;
  detail: string;
  faultId?: string;
  severity: number;
}

export interface Analysis {
  view: View;
  checkpoints: Checkpoint[];
  metrics: Metric[];
  strengths: Finding[];
  faults: Finding[];
  warnings: string[];
  detectedRatio: number;
  handPath: { x: number; y: number }[];
}

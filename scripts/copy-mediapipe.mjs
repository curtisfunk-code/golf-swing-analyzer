// Copies the MediaPipe WASM runtime into /public so the app can self-host it
// as an automatic fallback when the jsDelivr CDN is blocked.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dest = join(root, "public/mediapipe/wasm");
if (!existsSync(src)) {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision not installed yet; skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  cpSync(join(src, f), join(dest, f));
}
console.log("[copy-mediapipe] copied WASM runtime to public/mediapipe/wasm");

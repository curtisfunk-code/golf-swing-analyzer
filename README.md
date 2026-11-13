# Golf Swing Analyzer (prototype)

Free, private, in-browser golf swing analysis. Next.js 15, TypeScript, Tailwind v4, and `@mediapipe/tasks-vision` PoseLandmarker (lite).
Videos never leave the device: frames are decoded and scanned client-side.

## Run
```bash
npm install          # postinstall copies the MediaPipe WASM to public/mediapipe/wasm (self-hosted fallback)
npm run dev          # http://localhost:3005
npm run build && npm start   # production on :3005
```

## Configure the Amazon Associates tag
Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG` (default placeholder is `YOUR-TAG-20`).
Product links live in `src/data/faultProducts.json`. They're search links by default; add an `asin` to switch a product to a direct `/dp/` link.

## How it works
- `src/lib/mediapipe.ts`: loads PoseLandmarker from the official CDN (jsDelivr WASM + Google model), falling back to self-hosted `/public` copies, tries GPU then CPU, and seeks through the video frame by frame (≤ 450 frames, ~30 fps).
- `src/lib/analysis.ts`: fills and smooths landmarks, detects Address / Top / Impact / Follow-Through from hand speed and height, computes view-specific metrics, and ranks strengths and faults.
- `src/lib/synthetic.ts`: Demo Swing Simulator with 4 synthetic golfers (solid, slicer, caster, swayer) that output MediaPipe-format landmarks.
- `src/components/*`: UI (player with synced skeleton overlay, checkpoint thumbnails, report, product cards).

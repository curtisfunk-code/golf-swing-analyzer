import SwingAnalyzer from "@/components/SwingAnalyzer";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg">⛳</span>
            <span className="text-lg font-bold tracking-tight">Golf Swing Analyzer</span>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-950">Free · Beta</span>
          </div>
          <span className="hidden text-sm text-emerald-200 sm:block">Private by design: your video never leaves your device</span>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-10 pt-6">
          <h1 className="max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl">
            Find out what&apos;s really happening in your swing, free in 30 seconds.
          </h1>
          <p className="mt-3 max-w-2xl text-emerald-100">
            Upload a down-the-line or face-on video. AI pose tracking finds your address, top, impact and finish, shows what you&apos;re doing right, and
            ranks the fixes that matter, each with a drill.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-7xl px-6 pb-12">
        <SwingAnalyzer />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl space-y-2 px-6 py-6 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">As an Amazon Associate I earn from qualifying purchases.</p>
          <p>
            Some links on this site are affiliate links, marked &quot;(paid link)&quot;. If you buy through them we may earn a commission at no extra cost to you.
            Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.
          </p>
          <p>
            Pose detection runs locally with Google MediaPipe Pose Landmarker. Analysis is for practice guidance only and doesn&apos;t replace a PGA professional.
          </p>
        </div>
      </footer>
    </div>
  );
}

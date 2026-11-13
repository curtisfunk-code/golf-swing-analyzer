"use client";

import { AMAZON_TAG, FAULTS, IS_PLACEHOLDER_TAG, amazonLink } from "@/lib/affiliate";
import type { Analysis } from "@/lib/types";

const statusStyle = {
  good: "bg-emerald-100 text-emerald-800",
  ok: "bg-amber-100 text-amber-800",
  fault: "bg-rose-100 text-rose-700",
};

export default function Results({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-6">
      {analysis.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {analysis.warnings.map((w) => <p key={w}>⚠️ {w}</p>)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-emerald-900">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-sm text-white">✓</span>
            What You&apos;re Doing Right
          </h2>
          <ul className="mt-4 space-y-4">
            {analysis.strengths.map((s) => (
              <li key={s.metricId} className="rounded-xl bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">{s.title}</p>
                <p className="mt-1 text-sm text-slate-700">{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-500 text-sm text-white">!</span>
            What to Fix <span className="text-sm font-normal text-slate-500">(highest priority first)</span>
          </h2>
          {analysis.faults.length === 0 ? (
            <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
              No major faults detected from this angle. 🎉 Try filming the other camera view ({analysis.view === "DTL" ? "Face-On" : "Down-the-Line"}) to check the rest of your swing.
            </div>
          ) : (
            <ol className="mt-4 space-y-5">
              {analysis.faults.map((f, i) => {
                const entry = f.faultId ? FAULTS[f.faultId] : undefined;
                return (
                  <li key={f.metricId} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{f.title}</p>
                        <p className="mt-1 text-sm text-slate-700">{f.detail}</p>
                        {entry && (
                          <>
                            <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Why it matters:</span> {entry.why}</p>
                            <div className="mt-3 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200">
                              <p className="font-semibold text-emerald-900">🏌️ Drill: {entry.drill.name}</p>
                              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-slate-700">
                                {entry.drill.steps.map((s) => <li key={s}>{s}</li>)}
                              </ol>
                            </div>
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended training aids</p>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {entry.products.map((p) => (
                                  <a
                                    key={p.name}
                                    href={amazonLink(p)}
                                    target="_blank"
                                    rel="nofollow sponsored noopener noreferrer"
                                    className="group rounded-lg border border-slate-200 bg-white p-3 transition hover:border-emerald-600 hover:shadow"
                                  >
                                    <p className="font-semibold text-slate-900 group-hover:text-emerald-800">
                                      {p.name} <span className="text-xs font-normal text-slate-500">(paid link)</span>
                                    </p>
                                    <p className="mt-1 text-xs text-slate-600">{p.blurb}</p>
                                    <p className="mt-2 text-xs font-semibold text-amber-700">View on Amazon →</p>
                                  </a>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-4 text-xs text-slate-500">
            As an Amazon Associate I earn from qualifying purchases. Links marked (paid link) may earn a commission at no extra cost to you.
            {IS_PLACEHOLDER_TAG && (
              <span className="ml-1 rounded bg-yellow-100 px-1 font-mono text-[11px] text-yellow-900">
                dev: tag={AMAZON_TAG} placeholder. Set NEXT_PUBLIC_AMAZON_ASSOCIATES_TAG
              </span>
            )}
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-bold text-slate-900">Swing metrics ({analysis.view === "DTL" ? "Down-the-Line" : "Face-On"})</h3>
        <p className="text-xs text-slate-500">
          Measured from pose landmarks only. Club position isn&apos;t tracked, so club-related checks use body proxies. Pose detected in {Math.round(analysis.detectedRatio * 100)}% of frames.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr><th className="py-2 pr-4">Metric</th><th className="py-2 pr-4">Yours</th><th className="py-2 pr-4">Target</th><th className="py-2">Grade</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.metrics.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4 text-slate-800">{m.label}</td>
                  <td className="py-2 pr-4 tabular-nums text-slate-700">{m.display}</td>
                  <td className="py-2 pr-4 text-slate-500">{m.ideal}</td>
                  <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[m.status]}`}>{m.status === "ok" ? "fair" : m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

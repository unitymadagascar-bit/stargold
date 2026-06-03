import { Bell, ShieldAlert } from "lucide-react";
import type { MacroContext, NewsEvent } from "@/types";

export function NewsPanel({ news, macro }: { news: NewsEvent[]; macro: MacroContext }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">News et macro</h2>
        <Bell size={18} className="text-amber-200" />
      </div>
      <div className="mt-4 space-y-2">
        {news.map((event) => (
          <div key={event.title} className="flex items-center justify-between gap-3 rounded-md bg-slate-900/75 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-200">{event.title}</p>
              <p className="text-xs text-slate-500">Impact {event.impact}</p>
            </div>
            <span className="font-mono text-xs text-slate-300">{event.minutesAway} min</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
        <div className="flex gap-2">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <p>News importante proche : attendre si elle passe sous 30 minutes. Les signaux agressifs sont bloqués pendant la zone de risque.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <MacroPill label="DXY" value={macro.dxyDirection} />
        <MacroPill label="US10Y" value={macro.us10yDirection} />
        <MacroPill label="Fed" value={macro.fedTone} />
        <MacroPill label="Risk" value={macro.geopoliticalRisk} />
      </div>
    </section>
  );
}

function MacroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-900/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-slate-200">{value}</p>
    </div>
  );
}

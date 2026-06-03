import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {icon ? <div className="text-slate-400">{icon}</div> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
      {helper ? <p className="mt-2 text-sm leading-5 text-slate-400">{helper}</p> : null}
    </div>
  );
}

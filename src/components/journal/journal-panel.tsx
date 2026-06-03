import { BookOpen, Camera, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

const rows = [
  { setup: "Sweep + retest H1", score: 78, result: "+2.1R", emotion: "calme" },
  { setup: "Breakout M15 sans retest", score: 54, result: "-1R", emotion: "impatient" },
  { setup: "BOS H4 + discount", score: 82, result: "+3.0R", emotion: "discipliné" },
];

export function JournalPanel() {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/55 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Journal intelligent</h2>
        <BookOpen size={18} className="text-slate-300" />
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Setup</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Résultat</th>
              <th className="px-3 py-2 font-medium">Émotion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-slate-950/70 text-slate-300">
            {rows.map((row) => (
              <tr key={row.setup}>
                <td className="px-3 py-3">{row.setup}</td>
                <td className="px-3 py-3 font-mono">{row.score}</td>
                <td className="px-3 py-3 font-mono">{row.result}</td>
                <td className="px-3 py-3">{row.emotion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Insight icon={<TrendingUp size={16} />} label="Meilleur setup" value="Sweep + retest" />
        <Insight icon={<Camera size={16} />} label="Screenshots" value="Prêt à connecter" />
      </div>
    </section>
  );
}

function Insight({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-900/70 px-3 py-2">
      <span className="grid size-8 place-items-center rounded-md bg-white/[0.04] text-slate-300">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm text-slate-200">{value}</p>
      </div>
    </div>
  );
}

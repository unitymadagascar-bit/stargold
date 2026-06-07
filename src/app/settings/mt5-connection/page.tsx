"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { normalizeSymbol } from "@/lib/symbols/profiles";

interface DiagnosticItem {
  code: string;
  label: string;
  message: string;
  status: "ok" | "warning" | "error";
}

interface Mt5DiagnosticsPayload {
  ok: boolean;
  checkedAt: string;
  connection: {
    activeSource: string;
    brokerSymbol: string;
    candleCounts: Record<string, number>;
    connected: boolean;
    graphPrice: number | null;
    graphSource: string;
    lastPrice: number | null;
    lastTickAgeMs: number | null;
    lastTimestamp: string | null;
    persistence: string;
    requestedSymbol: string;
    source: string;
    symbol: string;
  } | null;
  diagnostics: DiagnosticItem[];
  error: string | null;
  setupUrl: string;
}

const defaultSymbol = "XAUUSD";

export default function Mt5ConnectionSettingsPage() {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [data, setData] = useState<Mt5DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol) || defaultSymbol, [symbol]);

  useEffect(() => {
    void runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runTest() {
    setLoading(true);
    setCopied(false);

    try {
      const response = await fetch(`/api/market/mt5/diagnostics?symbol=${encodeURIComponent(normalizedSymbol)}`, { cache: "no-store" });
      const payload = (await response.json()) as Mt5DiagnosticsPayload;
      setData(payload);
    } catch (error) {
      setData({
        ok: false,
        checkedAt: new Date().toISOString(),
        connection: null,
        diagnostics: [
          {
            code: "api-inaccessible",
            label: "API inaccessible",
            message: error instanceof Error ? error.message : "Impossible de contacter l'API diagnostic.",
            status: "error",
          },
        ],
        error: "Diagnostic impossible.",
        setupUrl: "https://tradetsr.vercel.app/api/market/mt5/ingest",
      });
    } finally {
      setLoading(false);
    }
  }

  async function copySetupUrl() {
    if (!data?.setupUrl) {
      return;
    }

    await navigator.clipboard.writeText(data.setupUrl);
    setCopied(true);
  }

  const connection = data?.connection;
  const connected = Boolean(connection?.connected);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-5">
      <header className="rounded-md border border-amber-300/20 bg-[#11100c] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img className="size-12 shrink-0 rounded-md border border-amber-300/25 bg-black object-cover" src="/star-gold-icon.png" alt="Star Gold By TSR" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Parametres / Connexion MT5</p>
              <h1 className="mt-1 text-2xl font-black text-white">Verifier la synchronisation MT5</h1>
              <p className="mt-1 text-sm text-slate-400">Diagnostic portable pour reconnecter Star Gold By TSR sur un nouveau PC.</p>
            </div>
          </div>
          <Link className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]" href="/">
            Retour dashboard
          </Link>
        </div>
      </header>

      <section className={`mt-3 rounded-md border px-4 py-3 ${connected ? "border-emerald-300/25 bg-emerald-300/10" : "border-rose-300/25 bg-rose-300/10"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-black/25 text-white">{connected ? <Wifi size={20} /> : <WifiOff size={20} />}</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">Statut de connexion MT5</p>
              <h2 className="mt-1 text-xl font-black text-white">{connected ? "Connecte" : "Deconnecte"}</h2>
              <p className="mt-1 text-sm text-slate-300">{data?.error ?? (connected ? "Dernier tick MT5 recu et exploitable." : "Aucune donnee MT5 live recue pour ce symbole.")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Symbole a tester</span>
              <input
                className="mt-1 h-10 w-36 rounded-md border border-white/10 bg-black/35 px-3 font-mono text-sm font-bold text-white outline-none focus:border-amber-300/50"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              />
            </label>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/15 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20" type="button" onClick={runTest} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
              Tester la connexion
            </button>
          </div>
        </div>
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-3">
        <Metric label="Dernier prix recu" value={formatPrice(connection?.lastPrice)} />
        <Metric label="Dernier timestamp recu" value={formatDateTime(connection?.lastTimestamp)} />
        <Metric label="Symbole actif" value={connection?.symbol ?? normalizedSymbol} />
        <Metric label="Suffixe detecte du broker" value={formatBrokerSuffix(connection?.brokerSymbol, connection?.symbol ?? normalizedSymbol)} />
        <Metric label="Symbole broker detecte" value={connection?.brokerSymbol ?? "--"} />
        <Metric label="Source des donnees utilisee" value={connection?.activeSource ?? "--"} />
        <Metric label="Source graphique/analyse" value={connection?.graphSource ?? "--"} />
        <Metric label="Stockage cloud" value={connection?.persistence ?? "--"} />
        <Metric label="Age dernier tick" value={connection?.lastTickAgeMs === null || connection?.lastTickAgeMs === undefined ? "--" : `${Math.round(connection.lastTickAgeMs)}ms`} />
      </section>

      <section className="mt-3 rounded-md border border-white/10 bg-[#171717] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">Diagnostic automatique</h2>
            <p className="mt-1 text-sm text-slate-400">Les points ci-dessous indiquent quoi corriger sur MT5, l'EA ou la source de prix.</p>
          </div>
          <p className="font-mono text-xs text-slate-500">Dernier test: {formatDateTime(data?.checkedAt)}</p>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {(data?.diagnostics ?? []).map((item) => (
            <DiagnosticRow key={item.code} item={item} />
          ))}
        </div>
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-white/10 bg-[#171717] p-4">
          <h2 className="text-lg font-black text-white">Guide rapide pour reconnecter MT5 sur un nouveau PC</h2>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            <li><strong className="text-white">1.</strong> Installe MT5, connecte le compte Exness, puis ouvre le symbole exact a trader.</li>
            <li><strong className="text-white">2.</strong> Copie <code>mt5/TradeTSRBridge.mq5</code> dans <code>MQL5/Experts/</code>, compile dans MetaEditor, puis rafraichis les Expert Advisors.</li>
            <li><strong className="text-white">3.</strong> Dans MT5: <code>Tools &gt; Options &gt; Expert Advisors</code>, active Algo Trading et autorise <code>https://tradetsr.vercel.app</code> dans WebRequest.</li>
            <li><strong className="text-white">4.</strong> Attache <code>TradeTSRBridge</code> au graphique du symbole. Laisse <code>InpEndpoint</code> sur l'URL API ci-dessous.</li>
            <li><strong className="text-white">5.</strong> Verifie l'onglet <code>Experts</code>: tu dois voir le ping OK ou une erreur WebRequest claire.</li>
            <li><strong className="text-white">6.</strong> Reviens ici et clique <code>Tester la connexion</code>. Si le tick date de moins de 10 secondes, la synchronisation est OK.</li>
          </ol>
        </div>

        <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-4">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-amber-100">URL API a configurer</h2>
          <p className="mt-3 break-all rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs leading-5 text-white">{data?.setupUrl ?? "https://tradetsr.vercel.app/api/market/mt5/ingest"}</p>
          <button className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-amber-300/30 bg-black/25 px-3 text-sm font-bold text-amber-100 transition hover:bg-black/35" type="button" onClick={copySetupUrl}>
            <Copy size={15} />
            {copied ? "URL copiee" : "Copier l'URL"}
          </button>
          <p className="mt-3 text-xs leading-5 text-amber-50">
            Sur un nouveau PC, l'application ne doit pas lire localhost en production. MT5 envoie les ticks vers cette URL cloud, puis Vercel lit le relais.
          </p>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#171717] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 break-words font-mono text-sm font-black text-white">{value}</p>
    </div>
  );
}

function DiagnosticRow({ item }: { item: DiagnosticItem }) {
  const className =
    item.status === "ok"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : item.status === "warning"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : "border-rose-300/20 bg-rose-300/10 text-rose-100";

  return (
    <div className={`rounded-md border p-3 ${className}`}>
      <div className="flex items-center gap-2">
        {item.status === "ok" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p className="font-bold text-white">{item.label}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-200">{item.message}</p>
    </div>
  );
}

function formatPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "--";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("fr-FR", { hour12: false });
}

function formatBrokerSuffix(brokerSymbol: string | null | undefined, baseSymbol: string) {
  if (!brokerSymbol) {
    return "--";
  }

  const normalizedBroker = normalizeSymbol(brokerSymbol);
  const normalizedBase = normalizeSymbol(baseSymbol);

  if (normalizedBroker === normalizedBase) {
    return "Aucun suffixe";
  }

  if (normalizedBroker.startsWith(normalizedBase)) {
    return normalizedBroker.slice(normalizedBase.length) || "Aucun suffixe";
  }

  return `Symbole different: ${normalizedBroker}`;
}

"use client";

import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, CircleDollarSign, Minus, ShieldAlert, X } from "lucide-react";
import type { FundamentalContext, Signal, Timeframe, TimeframeAnalysis, TradePlan } from "@/types";
import { SignalBadge } from "@/components/ui/signal-badge";

interface FinalTradingDecisionProps {
  activeAnalysis?: TimeframeAnalysis;
  activeTimeframe: Timeframe;
  analysisSourceLabel?: string;
  chartSourceLabel?: string;
  executionSourceLabel?: string;
  fundamental: FundamentalContext;
  plan: TradePlan;
  syncState?: {
    message: string;
    priceWarning: string | null;
    status: "SYNC OK" | "PARTIAL SYNC" | "NOT SYNCED";
  };
}

type CheckStatus = "yes" | "wait" | "no";
type DirectionTone = "buy" | "sell" | "wait";

export function FinalTradingDecision({ activeAnalysis, activeTimeframe, analysisSourceLabel, chartSourceLabel, executionSourceLabel, fundamental, plan, syncState }: FinalTradingDecisionProps) {
  const final = getFinalDecision({ activeAnalysis, activeTimeframe, fundamental, plan });
  const tone = getSignalTone(final.signal);
  const confirmationPending = final.signal === "WAIT" || final.signal === "WATCH BUY" || final.signal === "WATCH SELL" || final.signal === "ORB BREAKOUT WATCH" || final.signal === "FVG RETEST WATCH";

  return (
    <section className={`mt-3 overflow-hidden rounded-md border ${tone.border} bg-[#101318] shadow-[0_24px_70px_rgba(0,0,0,0.28)]`}>
      <div className={`border-b ${tone.border} ${tone.header} px-4 py-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Final Trading Decision</p>
            <h2 className="mt-1 text-xl font-black text-white">Plan simple avant execution</h2>
          </div>
          <div className="flex items-center gap-2">
            {chartSourceLabel ? <SourceBadge label={`Source graphique : ${chartSourceLabel}`} tone={chartSourceLabel.includes("TradingView") ? "blue" : "green"} /> : null}
            {analysisSourceLabel ? <SourceBadge label={`Source analyse : ${analysisSourceLabel}`} tone={analysisSourceLabel.includes("visual") ? "violet" : "green"} /> : null}
            {executionSourceLabel ? <SourceBadge label={`Source execution : ${executionSourceLabel}`} tone={executionSourceLabel.includes("non connecte") ? "red" : "green"} /> : null}
            {syncState ? <SourceBadge label={syncState.status} tone={syncState.status === "SYNC OK" ? "green" : syncState.status === "PARTIAL SYNC" ? "amber" : "red"} /> : null}
            <SignalBadge signal={final.signal} />
            <span className={`rounded-md border px-2.5 py-1 font-mono text-xs font-bold ${tone.badge}`}>{final.confidence}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <DirectionBanner final={final} />
        <div className="rounded-md border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Prochaine validation</p>
          <p className="mt-2 text-base font-bold leading-6 text-white">{final.nextConfirmation}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">Le sens indique le scenario a surveiller. L'entree reste bloquee tant que la confirmation n'est pas presente.</p>
        </div>
      </div>

      {syncState && syncState.status !== "SYNC OK" ? (
        <div className="border-b border-rose-300/20 bg-rose-300/10 px-4 py-3">
          <p className="text-sm font-bold text-rose-100">{syncState.message}</p>
          {syncState.priceWarning ? <p className="mt-1 text-xs leading-5 text-rose-100">{syncState.priceWarning}</p> : null}
        </div>
      ) : null}

      {plan.counterTrend.active ? (
        <div className={`border-b px-4 py-3 ${plan.counterTrend.allowed ? "border-amber-300/25 bg-amber-300/10" : "border-rose-300/20 bg-rose-300/10"}`}>
          <p className={`text-sm font-black uppercase tracking-[0.12em] ${plan.counterTrend.allowed ? "text-amber-100" : "text-rose-100"}`}>
            {plan.counterTrend.allowed ? "CONTRE-TENDANCE CONFIRMEE" : "CONTRE-TENDANCE BLOQUEE"}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">
            {plan.counterTrend.allowed
              ? "Risque plus eleve. Entree seulement apres confirmation. Ne pas anticiper."
              : "Priorite absolue au sens H1. Active seulement si setup premium complet: zone HTF, reaction, SMC, RR et score 85%."}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Score contre-tendance {plan.counterTrend.score}/{plan.counterTrend.threshold}. {plan.counterTrend.allowed ? plan.counterTrend.reasons.join(" / ") : plan.counterTrend.missing.join(" / ")}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DecisionTile label="Bias directionnel" value={final.directionalBias} tone={final.biasTone} />
          <DecisionTile label="Mode analyse" value={final.analysisModeLabel} tone={plan.analysisDepth === "quick" ? "warn" : "good"} />
          <DecisionTile label="Confirmation entree" value={final.entryConfirmation} tone={final.confirmationTone} />
          <DecisionTile label="Risque entree" value={final.entryRiskLevel} tone={final.entryRiskTone} />
          <DecisionTile label="Attendre avant entree" value={final.waitFor} wide />
          <DecisionTile label="Entry instruction" value={final.entryInstruction} wide />
          <DecisionTile label="Entry zone" value={final.entryZone} />
          <DecisionTile label="Stop loss" value={final.stopLoss} />
          <DecisionTile label="TP1 / TP2" value={final.takeProfits} />
          <DecisionTile label="ORB high / low" value={final.orbRange} />
          <DecisionTile label="FVG zone" value={final.fvgZone} />
          <DecisionTile label="ORB status" value={final.orbStatus} />
          <DecisionTile label="FVG status" value={final.fvgStatus} />
          <DecisionTile label="Retest status" value={final.retestStatus} />
          <DecisionTile label="M1 confirmation" value={final.m1ConfirmationStatus} />
          <DecisionTile label="MA trend bias" value={final.maStatus} />
          <DecisionTile label="Spread / news" value={final.safetyStatus} />
          <DecisionTile label="Partial TP" value={final.partialTakeProfit} />
          <DecisionTile label="Break-even rule" value={final.breakEvenRule} />
          <DecisionTile label="Lot capital-aware" value={plan.lotSize ? plan.lotSize.toFixed(2) : "--"} />
          <DecisionTile label="Risque compte" value={`$${plan.accountRisk.maxLoss.toFixed(2)} / jour $${plan.accountRisk.maxDailyLoss.toFixed(2)}`} />
          <DecisionTile label="Invalidation" value={final.invalidation} wide />
          <DecisionTile label="Risk level" value={plan.accountRisk.riskWarning ?? final.riskLevel} tone={plan.accountRisk.riskWarning ? "danger" : final.riskTone} />
        </div>

        <aside className="rounded-md border border-white/10 bg-black/25 p-3">
          <div className="flex items-center gap-2 text-amber-100">
            {confirmationPending ? <CircleAlert size={17} /> : <CircleDollarSign size={17} />}
            <p className="text-sm font-semibold">{confirmationPending ? "Confirmation attendue" : "Pourquoi ce plan"}</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{final.reason}</p>
          <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-200">
            <span className="font-semibold text-white">Raison du signal:</span> {final.signalReason}
          </p>
          {confirmationPending ? (
            <p className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/10 p-3 text-sm font-semibold leading-6 text-sky-100">
              {final.signal === "WAIT" ? "Condition manquante" : "Confirmation requise"}: {final.missingCondition}
            </p>
          ) : null}
        </aside>
      </div>

      <div className="grid gap-3 border-t border-white/10 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {final.checklist.map((item) => (
            <ChecklistItem key={item.label} label={item.label} status={item.status} />
          ))}
        </div>
        <div className="flex gap-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-200" size={18} />
          <p className="text-xs leading-5 text-amber-100">
            Ceci est une aide a la decision, pas un conseil financier. Ne prends aucun trade sans confirmation live, stop loss place, risque limite, et absence de news USD rouge.
          </p>
        </div>
      </div>
    </section>
  );
}

function SourceBadge({ label, tone }: { label: string; tone: "amber" | "blue" | "green" | "red" | "violet" }) {
  const classes =
    tone === "blue"
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : tone === "amber"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : tone === "red"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
      : tone === "violet"
        ? "border-violet-300/25 bg-violet-300/10 text-violet-100"
        : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";

  return <span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${classes}`}>{label}</span>;
}

function getFinalDecision({
  activeAnalysis,
  activeTimeframe,
  fundamental,
  plan,
}: {
  activeAnalysis?: TimeframeAnalysis;
  activeTimeframe: Timeframe;
  fundamental: FundamentalContext;
  plan: TradePlan;
}) {
  const signal = plan.decision;
  const bearish = signal === "WATCH SELL" || signal === "SELL SCALP READY" || signal === "SELL" || signal === "STRONG SELL" || plan.directionalBias === "Sell" || (signal !== "WAIT" && plan.direction === "Bearish");
  const bullish = signal === "WATCH BUY" || signal === "BUY SCALP READY" || signal === "BUY" || signal === "STRONG BUY" || plan.directionalBias === "Buy" || (signal !== "WAIT" && plan.direction === "Bullish");
  const orderBlock = activeAnalysis?.orderBlock ?? plan.orderBlock;
  const liquidity = activeAnalysis?.liquidity ?? plan.liquidity;
  const orb = plan.orb ?? activeAnalysis?.orb;
  const fvg = plan.fvg ?? activeAnalysis?.fvg;
  const trendFilter = plan.trendFilter ?? activeAnalysis?.trendFilter;
  const newsUnsafe = Boolean(fundamental.caution || activeAnalysis?.newsNearby || orb?.newsSafe === false);
  const trendAligned = Boolean(
    (bullish && activeAnalysis?.trend === "bullish") ||
      (bearish && activeAnalysis?.trend === "bearish") ||
      (signal === "WAIT" && activeAnalysis?.trend && activeAnalysis.trend !== "range"),
  );
  const orderBlockValid = Boolean(orderBlock && orderBlock.score >= 60 && orderBlock.strength !== "ignored");
  const liquidityConfirmed = Boolean(liquidity && (liquidity.rejectionConfirmed || liquidity.realBreakoutContinuation || (liquidity.sweepDetected && activeAnalysis?.liquiditySweep)));
  const m1Confirmation = Boolean(fvg?.rejectionConfirmed || plan.waitReason.includes("M1 confirmation detected") || (signal !== "WAIT" && signal !== "ORB BREAKOUT WATCH" && signal !== "FVG RETEST WATCH" && !plan.missingConditions.some((condition) => condition.includes("M1 rejection"))));
  const rejectionConfirmed = Boolean(liquidity?.rejectionConfirmed || m1Confirmation || activeAnalysis?.structure === "BOS" || activeAnalysis?.structure === "CHoCH");
  const orbValid = Boolean(orb && orb.breakoutConfirmed && !orb.fakeBreakout && orb.status !== "ORB FAILED");
  const fvgValid = Boolean(fvg && fvg.score >= 50 && fvg.fillState !== "invalid" && fvg.fillState !== "full");
  const fvgRetested = Boolean(fvg?.touched);
  const maSafe = !trendFilter?.strongAgainst;
  const spreadSafe = orb?.spreadOk ?? !plan.missingConditions.includes("Spread safe");
  const checklist = [
    { label: "Trend aligned", status: statusFromBoolean(trendAligned) },
    { label: "OB valid", status: statusFromBoolean(orderBlockValid) },
    { label: "Liquidity confirmed", status: statusFromBoolean(liquidityConfirmed) },
    { label: "Rejection confirmed", status: statusFromBoolean(rejectionConfirmed) },
    { label: "ORB breakout", status: statusFromBoolean(orbValid) },
    { label: "FVG retest", status: statusFromBoolean(fvgValid && fvgRetested) },
    { label: "M1 confirmation", status: statusFromBoolean(m1Confirmation) },
    { label: "MA safe", status: statusFromBoolean(maSafe) },
    { label: "Spread safe", status: statusFromBoolean(spreadSafe) },
    { label: "News safe", status: newsUnsafe ? "no" : "yes" },
  ] satisfies Array<{ label: string; status: CheckStatus }>;
  const firstFailedCheck = checklist.find((item) => item.status !== "yes");
  const missingCondition = translateMissingCondition(plan.missingConditions[0] ?? firstFailedCheck?.label ?? plan.waitReason);
  const entryZone = getEntryZone({ activeAnalysis, orderBlock, plan });
  const riskLevel = getRiskLevel({ fundamental, liquidity, newsUnsafe, plan });

  return {
    signal,
    actionLabel: getActionLabel({ bearish, bullish, signal }),
    actionSubtitle: getActionSubtitle({ bearish, bullish, signal }),
    directionBias: getDirectionBias({ bearish, bullish, plan, signal }),
    directionTone: getDirectionTone({ bearish, bullish }),
    directionalBias: plan.directionalBias,
    analysisModeLabel: plan.analysisDepth === "quick" ? "Analyse rapide" : "Analyse approfondie",
    biasTone: getBiasTone(plan.directionalBias),
    entryConfirmation: plan.entryConfirmation,
    confirmationTone: getConfirmationTone(plan.entryConfirmation),
    entryRiskLevel: plan.entryRiskLevel,
    entryRiskTone: getEntryRiskTone(plan.entryRiskLevel),
    signalReason: plan.signalReason,
    waitFor: plan.waitFor,
    nextConfirmation: getNextConfirmation({ missingCondition, signal }),
    confidence: Math.max(0, Math.min(100, Math.round(plan.score))),
    entryInstruction: getEntryInstruction({ bearish, bullish, signal }),
    entryZone,
    stopLoss: formatPrice(plan.stopLoss),
    takeProfits: `${formatPrice(plan.takeProfits[0])} / ${formatPrice(plan.takeProfits[1])}`,
    orbRange: orb ? `High ${formatPrice(orb.high)} / Low ${formatPrice(orb.low)} (${orb.duration}m)` : "No 30-min ORB range yet",
    fvgZone: fvg ? `${formatPrice(fvg.low)} - ${formatPrice(fvg.high)}` : "No valid FVG zone yet",
    orbStatus: orb ? `${orb.status} ${orb.session} ${orb.duration}m, ${orb.confidence}/100. ${orb.missingConfirmation}` : "No London/New York ORB yet",
    fvgStatus: fvg ? `${fvg.direction} ${formatPrice(fvg.low)}-${formatPrice(fvg.high)}, fill ${fvg.fillPercent}%, ${fvg.fillState}, score ${fvg.score}/100. ${fvg.missingConfirmation}` : "No fresh M1/M5/M15 FVG",
    retestStatus: fvg ? (fvg.touched ? `FVG retested, fill ${fvg.fillPercent}%` : "Waiting for FVG retest") : "Waiting for FVG after ORB breakout",
    m1ConfirmationStatus: m1Confirmation ? "M1 rejection/confirmation detected" : "Waiting for M1 rejection or micro BOS/CHoCH",
    maStatus: trendFilter ? `${trendFilter.type}${trendFilter.period} ${trendFilter.bias}, ${trendFilter.strongAgainst ? "against setup" : "safe bias"} (${trendFilter.distancePercent}%)` : "MA bias waiting for more candles",
    safetyStatus: `${spreadSafe ? "Spread safe" : "Spread too wide"} / ${newsUnsafe ? "News blocked" : "News safe"}`,
    partialTakeProfit: `Take partial profit at TP1 ${formatPrice(plan.takeProfits[0])}`,
    breakEvenRule: "After TP1 is reached, move Stop Loss to Break Even",
    invalidation: getInvalidation({ orderBlock, plan, newsUnsafe, signal }),
    riskLevel: riskLevel.label,
    riskTone: riskLevel.tone,
    reason: getReason({ activeTimeframe, fundamental, orderBlockValid, plan, rejectionConfirmed, signal }),
    missingCondition,
    checklist,
  };
}

function getActionLabel({ bearish, bullish, signal }: { bearish: boolean; bullish: boolean; signal: Signal }) {
  if (signal === "ORB BREAKOUT WATCH") {
    return bullish ? "WATCH BUY" : bearish ? "WATCH SELL" : "SURVEILLER";
  }

  if (signal === "FVG RETEST WATCH") {
    return bullish ? "WATCH BUY" : bearish ? "WATCH SELL" : "SURVEILLER";
  }

  if (signal === "WATCH BUY") {
    return "WATCH BUY";
  }

  if (signal === "WATCH SELL") {
    return "WATCH SELL";
  }

  if (signal === "BUY" || (signal !== "WAIT" && bullish)) {
    return "BUY";
  }

  if (signal === "SELL" || (signal !== "WAIT" && bearish)) {
    return "SELL";
  }

  return "ATTENDRE";
}

function getActionSubtitle({ bearish, bullish, signal }: { bearish: boolean; bullish: boolean; signal: Signal }) {
  if (signal === "ORB BREAKOUT WATCH") {
    return "Breakout detecte. Ne pas entrer: attendre la creation/retest FVG puis confirmation M1.";
  }

  if (signal === "FVG RETEST WATCH") {
    return "Prix sur la FVG. Ne pas entrer tant que le rejet ou micro BOS/CHoCH M1 n'est pas confirme.";
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL") {
    return "Setup en formation. Ne pas entrer encore: attendre la confirmation indiquee.";
  }

  if (signal === "BUY" || signal === "SELL") {
    return "Setup educatif confirme par le moteur de categorie. Verifie risque, news et spread avant toute decision.";
  }

  if (signal === "BUY SCALP READY" || signal === "SELL SCALP READY") {
    return "Entree possible apres une courte confirmation sur la prochaine bougie.";
  }

  if (signal === "STRONG BUY" || signal === "STRONG SELL") {
    return "Signal fort. Verifie quand meme news, spread, SL et taille de lot avant execution.";
  }

  if (bullish) {
    return "Pas d'entree maintenant. Le prochain scenario a surveiller est un BUY confirme.";
  }

  if (bearish) {
    return "Pas d'entree maintenant. Le prochain scenario a surveiller est un SELL confirme.";
  }

  return "Pas d'entree maintenant. Aucun biais exploitable n'est assez clair.";
}

function getDirectionBias({ bearish, bullish, plan, signal }: { bearish: boolean; bullish: boolean; plan: TradePlan; signal: Signal }) {
  if (signal === "ORB BREAKOUT WATCH") {
    return bullish ? "ORB BUY a surveiller" : bearish ? "ORB SELL a surveiller" : "ORB a surveiller";
  }

  if (signal === "FVG RETEST WATCH") {
    return bullish ? "Retest FVG BUY" : bearish ? "Retest FVG SELL" : "Retest FVG";
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL") {
    return "Setup a surveiller";
  }

  if (signal === "BUY" || signal === "SELL") {
    return "Decision educative";
  }

  if (signal === "BUY SCALP READY" || signal === "SELL SCALP READY") {
    return "Scalp ready";
  }

  if (signal === "STRONG BUY" || signal === "STRONG SELL") {
    return "Decision forte";
  }

  if (plan.directionalBias === "Buy") {
    return "Biais actuel: BUY, entree non confirmee";
  }

  if (plan.directionalBias === "Sell") {
    return "Biais actuel: SELL, entree non confirmee";
  }

  if (bullish) {
    return "Biais actuel: BUY a confirmer";
  }

  if (bearish) {
    return "Biais actuel: SELL a confirmer";
  }

  return "Biais actuel: neutre";
}

function getBiasTone(bias: TradePlan["directionalBias"]) {
  if (bias === "Buy") {
    return "good" as const;
  }

  if (bias === "Sell") {
    return "danger" as const;
  }

  return "warn" as const;
}

function getEntryRiskTone(risk: TradePlan["entryRiskLevel"]) {
  if (risk === "Low") {
    return "good" as const;
  }

  if (risk === "Medium") {
    return "warn" as const;
  }

  return "danger" as const;
}

function getConfirmationTone(confirmation: TradePlan["entryConfirmation"]) {
  return confirmation === "Confirmed" ? ("good" as const) : ("warn" as const);
}

function getDirectionTone({ bearish, bullish }: { bearish: boolean; bullish: boolean }): DirectionTone {
  if (bullish) {
    return "buy";
  }

  if (bearish) {
    return "sell";
  }

  return "wait";
}

function getNextConfirmation({ missingCondition, signal }: { missingCondition: string; signal: Signal }) {
  if (signal === "ORB BREAKOUT WATCH") {
    return missingCondition || "Wait for same-direction FVG, then FVG retest.";
  }

  if (signal === "FVG RETEST WATCH") {
    return missingCondition || "Wait for M1 rejection candle or micro BOS/CHoCH from the FVG.";
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL") {
    return missingCondition;
  }

  if (signal === "BUY" || signal === "SELL") {
    return "Verifier news, spread, SL, TP et taille de lot avant toute execution manuelle.";
  }

  if (signal === "BUY SCALP READY" || signal === "SELL SCALP READY") {
    return "Entry trigger: cassure/rejet sur la prochaine bougie M1/M5 dans le sens du signal.";
  }

  if (signal === "STRONG BUY" || signal === "STRONG SELL") {
    return "Verifier une derniere fois le rejet/BOS, la news, le spread et le stop loss avant execution.";
  }

  return missingCondition;
}

function getEntryInstruction({ bearish, bullish, signal }: { bearish: boolean; bullish: boolean; signal: Signal }) {
  if (signal === "WAIT") {
    return "Do not enter. Wait for every checklist item to turn valid.";
  }

  if (signal === "ORB BREAKOUT WATCH" || signal === "FVG RETEST WATCH") {
    return "Watch only. No entry until FVG retest plus M1 rejection/confirmation.";
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL") {
    return "Watch only. No entry until the missing confirmation appears.";
  }

  if (signal === "BUY") {
    return "Buy only if execution, risk and spread remain acceptable.";
  }

  if (signal === "SELL") {
    return "Sell only if execution, risk and spread remain acceptable.";
  }

  if (bullish) {
    return "Buy scalp after the next short trigger: rejection candle or bullish micro BOS/CHoCH.";
  }

  if (bearish) {
    return "Sell scalp after the next short trigger: rejection candle or bearish micro BOS/CHoCH.";
  }

  return "Do not enter until direction is clear.";
}

function getEntryZone({ activeAnalysis, orderBlock, plan }: { activeAnalysis?: TimeframeAnalysis; orderBlock: NonNullable<TradePlan["orderBlock"]> | null; plan: TradePlan }) {
  const fvg = activeAnalysis?.fvg ?? plan.fvg;

  if (fvg) {
    return `${formatPrice(fvg.low)} - ${formatPrice(fvg.high)}`;
  }

  if (orderBlock) {
    return `${formatPrice(orderBlock.low)} - ${formatPrice(orderBlock.high)}`;
  }

  if (plan.entry) {
    return `Around ${formatPrice(plan.entry)}`;
  }

  if (activeAnalysis?.support && activeAnalysis.resistance) {
    return `${formatPrice(activeAnalysis.support)} - ${formatPrice(activeAnalysis.resistance)}`;
  }

  return "No valid zone yet";
}

function getInvalidation({ orderBlock, plan, newsUnsafe, signal }: { orderBlock: NonNullable<TradePlan["orderBlock"]> | null; plan: TradePlan; newsUnsafe: boolean; signal: Signal }) {
  if (newsUnsafe) {
    return "Blocked: red USD news risk";
  }

  if (signal === "WAIT") {
    return "Any entry is invalid until missing condition is confirmed";
  }

  if (signal === "WATCH BUY" || signal === "WATCH SELL" || signal === "ORB BREAKOUT WATCH" || signal === "FVG RETEST WATCH") {
    return "Invalid if FVG is fully filled without rejection or price closes back inside ORB range";
  }

  const zoneText = orderBlock ? " or OB zone is broken cleanly" : "";
  return `Close beyond SL ${formatPrice(plan.stopLoss)}${zoneText}`;
}

function getRiskLevel({ fundamental, liquidity, newsUnsafe, plan }: { fundamental: FundamentalContext; liquidity: TradePlan["liquidity"]; newsUnsafe: boolean; plan: TradePlan }) {
  if (newsUnsafe || fundamental.riskLevel === "eleve" || liquidity?.riskLevel === "eleve") {
    return { label: "High", tone: "danger" as const };
  }

  if (plan.score < 60 || fundamental.riskLevel === "modere" || liquidity?.riskLevel === "modere") {
    return { label: "Moderate", tone: "warn" as const };
  }

  return { label: "Controlled", tone: "good" as const };
}

function getReason({
  activeTimeframe,
  fundamental,
  orderBlockValid,
  plan,
  rejectionConfirmed,
  signal,
}: {
  activeTimeframe: Timeframe;
  fundamental: FundamentalContext;
  orderBlockValid: boolean;
  plan: TradePlan;
  rejectionConfirmed: boolean;
  signal: Signal;
}) {
  if (signal === "WAIT") {
    return `${plan.analysisDepth === "quick" ? "Analyse rapide" : "Analyse approfondie"}: ${plan.signalReason}. ${plan.missingConditions.length ? `Missing: ${plan.missingConditions.join(", ")}.` : "The setup still needs confirmation."}`;
  }

  if (signal === "ORB BREAKOUT WATCH") {
    return `${signal} on ${activeTimeframe}: breakout is detected, but the FVG retest sequence is not complete yet.`;
  }

  if (signal === "FVG RETEST WATCH") {
    return `${signal} on ${activeTimeframe}: price is retesting the FVG; wait for M1 rejection or micro BOS/CHoCH before entry.`;
  }

  const confirmation = rejectionConfirmed ? "price-action confirmation is present" : "confirmation must remain visible before execution";
  const ob = orderBlockValid ? "a valid Order Block is mapped" : "the Order Block is not the only reason for entry";
  const news = fundamental.caution ? "USD news risk is active, so trade should be blocked" : "USD news filter is safe";
  return `${signal} on ${activeTimeframe}: ${ob}, ${confirmation}, and ${news}.`;
}

function translateMissingCondition(condition: string) {
  const translations: Record<string, string> = {
    "No red USD news risk": "Wait until red USD news risk is gone.",
    "Liquidity confirmation after sweep": "Wait for rejection after liquidity is taken.",
    "Confidence >= 75": "Wait for confidence to reach 75%.",
    "Risk/reward above 1:1.2": "Wait for a better entry or wider target so RR is at least 1:1.2.",
    "Strong Order Block": "Wait for a strong Order Block.",
    "OB retest/touch": "Wait for price to retest the entry zone.",
    "Price action confirmation": "Wait for rejection candle or BOS/CHoCH.",
    "Micro BOS/CHoCH": "Wait for a micro BOS/CHoCH.",
    "Quick rejection candle": "Wait for a rejection candle.",
    "Live MT5 candles": "Wait for live candles from MT5 or fallback market feed.",
    "Crypto OHLC Feed": "TradingView affiche le marche en mode visuel; le Crypto OHLC Feed doit fournir des bougies exploitables pour calculer automatiquement BUY / SELL / WAIT.",
    "Clear M1/M5 micro direction": "Wait for M1/M5 to show a clear buy or sell micro direction.",
    "Entry confirmation: rejection candle, micro BOS/CHoCH, or momentum from zone": "Wait for a rejection candle, micro BOS/CHoCH, or momentum from the zone.",
    "ATR acceptable": "Wait for ATR/volatility to become tradable.",
    "Higher timeframe is strongly opposite": "Do not scalp against a strongly opposite H1/H4 context.",
    "ORB not failed": "Wait for a valid ORB breakout that has not failed.",
    "FVG rejection confirmation": "Wait for FVG rejection confirmation.",
    "Fresh or partial FVG only": "Wait for a fresh or partial FVG, not a fully filled one.",
    "30-minute ORB range formed": "Wait until the 30-minute opening range is formed.",
    "Candle close outside 30-minute OR high/low": "Wait for a candle close outside the 30-minute OR high or low.",
    "FVG created after ORB breakout": "Wait for the breakout to create a same-direction FVG.",
    "FVG retest": "Wait for price to retest the FVG zone.",
    "M1 rejection/confirmation after FVG retest": "Wait for M1 rejection candle or micro BOS/CHoCH after the FVG retest.",
    "MA trend not strongly against setup": "Wait until the MA bias is no longer clearly against the setup.",
    "Spread safe": "Wait for spread to normalize before scalping.",
  };

  if (condition.startsWith("At least")) {
    return "Wait until at least 3 scalp setup conditions are true.";
  }

  if (condition.startsWith("Confidence")) {
    return "Wait until confidence reaches the WATCH threshold.";
  }

  if (condition.startsWith("Risk/reward")) {
    return "Wait for a better entry or target so risk/reward is acceptable.";
  }

  return translations[condition] ?? condition;
}

function DecisionTile({ label, tone, value, wide = false }: { label: string; tone?: "danger" | "good" | "warn"; value: string; wide?: boolean }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-100"
      : tone === "good"
        ? "text-emerald-100"
        : tone === "warn"
          ? "text-amber-100"
          : "text-white";

  return (
    <div className={`rounded-md border border-white/10 bg-black/25 p-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-sm font-semibold leading-5 ${toneClass}`}>{value}</p>
    </div>
  );
}

function DirectionBanner({
  final,
}: {
  final: {
    actionLabel: string;
    actionSubtitle: string;
    directionBias: string;
    directionTone: DirectionTone;
  };
}) {
  const isBuy = final.directionTone === "buy";
  const isSell = final.directionTone === "sell";
  const toneClass = isBuy
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
    : isSell
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : "border-sky-300/30 bg-sky-300/10 text-sky-100";
  const icon = isBuy ? <ArrowUpRight size={42} /> : isSell ? <ArrowDownRight size={42} /> : <CircleAlert size={38} />;

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">Action immediate</p>
          <p className="mt-1 text-4xl font-black leading-none text-white">{final.actionLabel}</p>
        </div>
        <div className="grid size-16 place-items-center rounded-md bg-black/25 text-white">{icon}</div>
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2">
        <p className="text-sm font-black uppercase tracking-[0.08em] text-white">{final.directionBias}</p>
        <p className="mt-1 text-sm leading-5 opacity-90">{final.actionSubtitle}</p>
      </div>
    </div>
  );
}

function ChecklistItem({ label, status }: { label: string; status: CheckStatus }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-md ${
          status === "yes" ? "bg-emerald-300/15 text-emerald-200" : status === "no" ? "bg-rose-300/15 text-rose-200" : "bg-sky-300/15 text-sky-200"
        }`}
      >
        {status === "yes" ? <Check size={15} /> : status === "no" ? <X size={15} /> : <Minus size={15} />}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function getSignalTone(signal: Signal) {
  if (signal === "STRONG BUY" || signal === "BUY" || signal === "BUY SCALP READY" || signal === "WATCH BUY") {
    return {
      badge: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
      border: "border-emerald-300/20",
      header: "bg-emerald-300/10",
    };
  }

  if (signal === "ORB BREAKOUT WATCH" || signal === "FVG RETEST WATCH") {
    return {
      badge: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
      border: "border-cyan-300/20",
      header: "bg-cyan-300/10",
    };
  }

  if (signal === "STRONG SELL" || signal === "SELL" || signal === "SELL SCALP READY" || signal === "WATCH SELL") {
    return {
      badge: "border-rose-300/25 bg-rose-300/10 text-rose-100",
      border: "border-rose-300/20",
      header: "bg-rose-300/10",
    };
  }

  return {
    badge: "border-sky-300/25 bg-sky-300/10 text-sky-100",
    border: "border-sky-300/20",
    header: "bg-sky-300/10",
  };
}

function statusFromBoolean(value: boolean): CheckStatus {
  return value ? "yes" : "wait";
}

function formatPrice(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value.toFixed(2) : "--";
}

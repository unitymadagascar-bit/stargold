import type {
  Candle,
  Direction,
  FundamentalContext,
  MacroContext,
  NewsEvent,
  Signal,
  SignalMode,
  TechnicalAnalysis,
  Timeframe,
  TimeframeAnalysis,
  TradePlan,
  Trend,
} from "@/types";
import { analyzeCandles } from "@/lib/analysis/market-structure";
import { detectLiquidityAnalysis } from "@/lib/analysis/liquidity";
import { detectOrderBlock } from "@/lib/analysis/order-blocks";
import { timeframes } from "@/lib/market/timeframes";
import { calculateRiskReward, calculateLotSize } from "@/lib/risk/risk";
import { generateFinalDecision, inferDirection } from "@/lib/scoring/confluence";
import { applyFundamentalDecisionGuard, calculateFundamentalDecisionScore, getDecisionStrength, hasRequiredTechnicalConfirmation } from "@/lib/fundamentals/decision-score";

const MIN_ANALYSIS_CANDLES = 30;
const SCALPING_TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15"];

interface DecisionResult {
  signal: Signal;
  confidence: number;
  waitReason: string;
  missingConditions: string[];
}

interface HigherTimeframeContext {
  trend: Trend;
  strong: boolean;
}

export function getLatestPrice(candleMap: Record<Timeframe, Candle[]>): number {
  for (const timeframe of timeframes) {
    const close = candleMap[timeframe].at(-1)?.close;

    if (close) {
      return close;
    }
  }

  return 0;
}

export function buildLiveTimeframeAnalyses({
  candleMap,
  fundamental,
  macro,
  mode = "conservative",
  news,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  fundamental: FundamentalContext;
  macro: MacroContext;
  mode?: SignalMode;
  news: NewsEvent[];
}): TimeframeAnalysis[] {
  void macro;
  const higherTimeframe = getHigherTimeframeContext(candleMap);
  const redNewsNearby = hasRedNewsRisk({ fundamental, news });

  return timeframes.map((timeframe) => {
    const candles = candleMap[timeframe];

    if (candles.length < MIN_ANALYSIS_CANDLES) {
      return emptyTimeframeAnalysis({ mode, newsNearby: redNewsNearby, timeframe, waitReason: "WAIT: not enough live candles" });
    }

    const baseAnalysis = analyzeCandles(candles);
    const price = candles.at(-1)?.close ?? 0;
    const direction = inferDirection(baseAnalysis);
    const stopLoss = getStopLoss(direction, price, baseAnalysis.support, baseAnalysis.resistance, baseAnalysis.atr);
    const target = direction === "Bearish" ? price - Math.abs(price - stopLoss) * 2 : price + Math.abs(price - stopLoss) * 2;
    const riskReward = calculateRiskReward(price, stopLoss, target);
    const analysis = withOrderBlock({ analysis: baseAnalysis, candles, higherTimeframeTrend: higherTimeframe.trend, newsRisk: redNewsNearby, riskReward });
    const scoring = calculateFundamentalDecisionScore({ analysis, direction, fundamental, riskReward });
    const decision = evaluateSignal({
      analysis,
      candles,
      conservativeScore: scoring.total,
      direction,
      fundamental,
      higherTimeframe,
      mode,
      news,
      redNewsNearby,
      riskReward,
      timeframe,
    });

    return {
      timeframe,
      signal: decision.signal,
      signalMode: mode,
      waitReason: decision.waitReason,
      missingConditions: decision.missingConditions,
      score: decision.confidence,
      trend: analysis.trend,
      rsi: analysis.rsi,
      atr: analysis.atr,
      structure: analysis.structure,
      support: analysis.support,
      resistance: analysis.resistance,
      liquiditySweep: analysis.liquiditySweep,
      retestConfirmed: analysis.retestConfirmed,
      volatility: analysis.volatility,
      newsNearby: redNewsNearby,
      orderBlock: analysis.orderBlock,
      liquidity: analysis.liquidity,
      riskReward: Number(riskReward.toFixed(2)),
      summary: `${decision.waitReason}. ${decision.missingConditions.length ? `Missing: ${decision.missingConditions.join(", ")}.` : "Conditions validees."}`,
    };
  });
}

export function buildLiveTradePlan({
  candleMap,
  fundamental,
  macro,
  mode = "conservative",
  news,
  preferredTimeframe,
}: {
  candleMap: Record<Timeframe, Candle[]>;
  fundamental: FundamentalContext;
  macro: MacroContext;
  mode?: SignalMode;
  news: NewsEvent[];
  preferredTimeframe?: Timeframe;
}): TradePlan {
  void macro;
  const analysisTimeframe = getPlanTimeframe(candleMap, mode, preferredTimeframe);
  const candles = candleMap[analysisTimeframe];
  const price = getLatestPrice(candleMap);

  if (!price || candles.length < MIN_ANALYSIS_CANDLES) {
    return {
      direction: "Neutral",
      decision: "WAIT",
      signalMode: mode,
      waitReason: "WAIT: not enough live candles",
      missingConditions: ["Live MT5 candles"],
      score: 0,
      summary: "Flux live connecte requis pour calculer un plan fiable. Aucun signal n'est genere depuis des donnees fictives.",
      entry: price,
      stopLoss: 0,
      takeProfits: [0, 0, 0],
      riskReward: 0,
      lotSize: 0,
      alerts: ["Aucune donnee mock n'est utilisee pour le graphique.", "Connecte un flux XAUUSD temps reel pour activer le plan."],
      scoring: { technical: 0, orderFlow: 0, fundamental: 0, risk: 0, total: 0 },
      orderBlock: null,
      liquidity: null,
    };
  }

  const higherTimeframe = getHigherTimeframeContext(candleMap);
  const baseAnalysis = analyzeCandles(candles);
  const direction = inferDirection(baseAnalysis);
  const riskUnit = Math.max(baseAnalysis.atr * 1.25, price * 0.001);
  const stopLoss = getStopLoss(direction, price, baseAnalysis.support, baseAnalysis.resistance, riskUnit);
  const takeProfits = getTakeProfits(direction, price, Math.abs(price - stopLoss));
  const riskReward = calculateRiskReward(price, stopLoss, takeProfits[0]);
  const redNewsNearby = hasRedNewsRisk({ fundamental, news });
  const analysis = withOrderBlock({ analysis: baseAnalysis, candles, higherTimeframeTrend: higherTimeframe.trend, newsRisk: redNewsNearby, riskReward });
  const scoring = calculateFundamentalDecisionScore({ analysis, direction, fundamental, riskReward });
  const decision = evaluateSignal({
    analysis,
    candles,
    conservativeScore: scoring.total,
    direction,
    fundamental,
    higherTimeframe,
    mode,
    news,
    redNewsNearby,
    riskReward,
    timeframe: analysisTimeframe,
  });

  return {
    direction,
    decision: decision.signal,
    signalMode: mode,
    waitReason: decision.waitReason,
    missingConditions: decision.missingConditions,
    score: decision.confidence,
    summary: `${summarizeDecision(decision.signal, direction, mode)} ${decision.waitReason}. ${describeOrderBlock(analysis)} ${fundamental.cautionMessage ?? getDecisionStrength(scoring.total)}.`,
    entry: round(price),
    stopLoss: round(stopLoss),
    takeProfits: takeProfits.map(round) as [number, number, number],
    riskReward: Number(riskReward.toFixed(2)),
    lotSize: calculateLotSize({ capital: 10000, riskPercent: 1, stopLossDistance: Math.abs(price - stopLoss), pipValue: 10 }),
    alerts: [
      decision.waitReason,
      ...decision.missingConditions.map((condition) => `Missing before signal: ${condition}`),
      mode === "scalping" ? "Scalping has higher risk and requires strict stop loss." : "Conservative mode requires stronger confirmation.",
      analysis.liquiditySweep ? "Liquidity sweep detecte sur les bougies live." : "Pas de sweep confirme pour l'instant.",
      describeOrderBlock(analysis),
      "Order Block is an analysis zone, not a guaranteed entry.",
      fundamental.usdInterpretation,
    ],
    scoring,
    orderBlock: analysis.orderBlock,
    liquidity: analysis.liquidity,
  };
}

function evaluateSignal({
  analysis,
  candles,
  conservativeScore,
  direction,
  fundamental,
  higherTimeframe,
  mode,
  news,
  redNewsNearby,
  riskReward,
  timeframe,
}: {
  analysis: TechnicalAnalysis;
  candles: Candle[];
  conservativeScore: number;
  direction: Direction;
  fundamental: FundamentalContext;
  higherTimeframe: HigherTimeframeContext;
  mode: SignalMode;
  news: NewsEvent[];
  redNewsNearby: boolean;
  riskReward: number;
  timeframe: Timeframe;
}): DecisionResult {
  if (mode === "scalping") {
    return evaluateScalpingSignal({ analysis, candles, direction, higherTimeframe, redNewsNearby, riskReward, timeframe });
  }

  return evaluateConservativeSignal({ analysis, conservativeScore, direction, fundamental, news, redNewsNearby, riskReward });
}

function evaluateConservativeSignal({
  analysis,
  conservativeScore,
  direction,
  fundamental,
  news,
  redNewsNearby,
  riskReward,
}: {
  analysis: TechnicalAnalysis;
  conservativeScore: number;
  direction: Direction;
  fundamental: FundamentalContext;
  news: NewsEvent[];
  redNewsNearby: boolean;
  riskReward: number;
}): DecisionResult {
  const baseDecision = generateFinalDecision({
    direction,
    score: conservativeScore,
    riskReward,
    volatility: analysis.volatility,
    dangerousNews: redNewsNearby,
    confirmations: countConfirmations(analysis, direction),
  });
  const guardedDecision = applyFundamentalDecisionGuard({
    baseDecision,
    fundamental,
    hasTechnicalConfirmation: hasRequiredTechnicalConfirmation(analysis),
    score: conservativeScore,
  });
  const signal = applyLiquidityDecisionGuard({
    analysis,
    decision: applyOrderBlockDecisionGuard({ analysis, decision: guardedDecision, direction }),
  });
  const missingConditions = getConservativeMissingConditions({ analysis, direction, news, redNewsNearby, riskReward, score: conservativeScore });

  return {
    signal,
    confidence: conservativeScore,
    waitReason: signal === "WAIT" ? getWaitReason(missingConditions) : `${signal}: conservative confirmation`,
    missingConditions,
  };
}

function evaluateScalpingSignal({
  analysis,
  candles,
  direction,
  higherTimeframe,
  redNewsNearby,
  riskReward,
  timeframe,
}: {
  analysis: TechnicalAnalysis;
  candles: Candle[];
  direction: Direction;
  higherTimeframe: HigherTimeframeContext;
  redNewsNearby: boolean;
  riskReward: number;
  timeframe: Timeframe;
}): DecisionResult {
  if (!SCALPING_TIMEFRAMES.includes(timeframe)) {
    return {
      signal: "WAIT",
      confidence: 0,
      waitReason: "WAIT: scalping mode only uses M1/M5/M15",
      missingConditions: ["Select M1, M5 or M15"],
    };
  }

  const micro = evaluateMicroStructure(candles, analysis, direction);
  const higherTimeframeConflict = isHigherTimeframeConflict(micro.direction, higherTimeframe);
  const missingConditions = [
    redNewsNearby ? "No red USD news risk" : null,
    higherTimeframeConflict ? "Higher timeframe conflict must ease" : null,
    micro.direction === "Neutral" ? "Clear M1/M5 micro direction" : null,
    micro.microBos ? null : "Micro BOS/CHoCH",
    micro.momentum ? null : "Short-term momentum",
    micro.rejection ? null : "Quick rejection candle",
    micro.sweep ? null : "Liquidity sweep",
    micro.atrOk ? null : "ATR/volatility enough",
    micro.zoneOk ? null : "Price closer to zone/retest",
    riskReward >= 1.2 ? null : "Risk/reward above 1:1.2",
  ].filter(Boolean) as string[];

  if (redNewsNearby) {
    return { signal: "WAIT", confidence: micro.confidence, waitReason: "WAIT: news risk", missingConditions };
  }

  if (higherTimeframeConflict) {
    return { signal: "WAIT", confidence: micro.confidence, waitReason: "WAIT: higher timeframe conflict / counter-trend risk", missingConditions };
  }

  if (micro.confidence < 60) {
    return { signal: "WAIT", confidence: micro.confidence, waitReason: getWaitReason(missingConditions), missingConditions };
  }

  if (micro.direction === "Bullish") {
    return { signal: "BUY SCALP", confidence: micro.confidence, waitReason: "BUY SCALP: short-term setup active", missingConditions: [] };
  }

  if (micro.direction === "Bearish") {
    return { signal: "SELL SCALP", confidence: micro.confidence, waitReason: "SELL SCALP: short-term setup active", missingConditions: [] };
  }

  return { signal: "WAIT", confidence: micro.confidence, waitReason: "WAIT: no momentum", missingConditions };
}

function evaluateMicroStructure(candles: Candle[], analysis: TechnicalAnalysis, fallbackDirection: Direction) {
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const recent = candles.slice(-10);
  const prior = candles.slice(-12, -1);

  if (!last || !previous || recent.length < 6 || prior.length < 5) {
    return {
      confidence: 0,
      direction: "Neutral" as Direction,
      microBos: false,
      momentum: false,
      rejection: false,
      sweep: false,
      atrOk: false,
      zoneOk: false,
    };
  }

  const previousHigh = Math.max(...prior.map((candle) => candle.high));
  const previousLow = Math.min(...prior.map((candle) => candle.low));
  const bullishMicroBos = last.close > previousHigh || analysis.structure === "BOS";
  const bearishMicroBos = last.close < previousLow || analysis.structure === "CHoCH";
  const body = Math.max(Math.abs(last.close - last.open), analysis.atr * 0.05);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const bullishRejection = lowerWick >= body * 1.15 && last.close > last.open;
  const bearishRejection = upperWick >= body * 1.15 && last.close < last.open;
  const bullishSweep = (last.low < previousLow && last.close > previousLow) || (analysis.liquiditySweep && fallbackDirection === "Bullish");
  const bearishSweep = (last.high > previousHigh && last.close < previousHigh) || (analysis.liquiditySweep && fallbackDirection === "Bearish");
  const bullishMomentum = recent.slice(-3).filter((candle) => candle.close > candle.open).length >= 2 && last.close > previous.close && analysis.ema20 >= analysis.ema50;
  const bearishMomentum = recent.slice(-3).filter((candle) => candle.close < candle.open).length >= 2 && last.close < previous.close && analysis.ema20 <= analysis.ema50;
  const bullishScore = [bullishMicroBos, bullishRejection, bullishSweep, bullishMomentum].filter(Boolean).length;
  const bearishScore = [bearishMicroBos, bearishRejection, bearishSweep, bearishMomentum].filter(Boolean).length;
  const direction: Direction = bullishScore > bearishScore ? "Bullish" : bearishScore > bullishScore ? "Bearish" : fallbackDirection;
  const microBos = direction === "Bullish" ? bullishMicroBos : bearishMicroBos;
  const rejection = direction === "Bullish" ? bullishRejection : bearishRejection;
  const sweep = direction === "Bullish" ? bullishSweep : bearishSweep;
  const momentum = direction === "Bullish" ? bullishMomentum : bearishMomentum;
  const atrOk = analysis.volatility !== "calme" && analysis.volatility !== "trop dangereuse" && analysis.atr > Math.max(last.close * 0.00018, 0.35);
  const zoneOk = isPriceNearActionZone({ analysis, price: last.close });
  const confidence = clamp(
    (direction !== "Neutral" ? 6 : 0) +
      (microBos ? 18 : 0) +
      (momentum ? 18 : 0) +
      (rejection ? 14 : 0) +
      (sweep ? 14 : 0) +
      (atrOk ? 10 : 0) +
      (zoneOk ? 10 : 0) +
      (analysis.displacement ? 5 : 0) +
      (analysis.orderBlock?.score && analysis.orderBlock.score >= 60 ? 5 : 0) +
      (analysis.liquidity.rejectionConfirmed || analysis.liquidity.realBreakoutContinuation ? 8 : 0),
    100,
  );

  return { confidence, direction, microBos, momentum, rejection, sweep, atrOk, zoneOk };
}

function withOrderBlock({
  analysis,
  candles,
  higherTimeframeTrend,
  newsRisk,
  riskReward,
}: {
  analysis: TechnicalAnalysis;
  candles: Candle[];
  higherTimeframeTrend: Trend;
  newsRisk: boolean;
  riskReward: number;
}): TechnicalAnalysis {
  return {
    ...analysis,
    orderBlock: detectOrderBlock({ candles, higherTimeframeTrend, riskReward }),
    liquidity: detectLiquidityAnalysis(candles, newsRisk),
  };
}

function getHigherTimeframeContext(candleMap: Record<Timeframe, Candle[]>): HigherTimeframeContext {
  const h1 = candleMap.H1.length >= MIN_ANALYSIS_CANDLES ? analyzeCandles(candleMap.H1).trend : "range";
  const h4 = candleMap.H4.length >= MIN_ANALYSIS_CANDLES ? analyzeCandles(candleMap.H4).trend : "range";
  const aligned = h1 === h4 && h1 !== "range";

  return {
    trend: aligned ? h1 : "range",
    strong: aligned,
  };
}

function countConfirmations(analysis: TechnicalAnalysis, direction: Direction) {
  return [
    analysis.structure === "BOS" || analysis.structure === "CHoCH",
    analysis.liquiditySweep,
    analysis.retestConfirmed,
    analysis.displacement,
    analysis.ema20 !== analysis.ema50,
    isStrongTouchedOrderBlock(analysis, direction) && hasOrderBlockPriceActionConfirmation(analysis, direction),
  ].filter(Boolean).length;
}

function applyOrderBlockDecisionGuard({ analysis, decision, direction }: { analysis: TechnicalAnalysis; decision: Signal; direction: Direction }) {
  if (decision !== "STRONG BUY" && decision !== "STRONG SELL") {
    return decision;
  }

  const orderBlock = analysis.orderBlock;

  if (!orderBlock || orderBlock.score < 60) {
    return "WAIT";
  }

  if (!directionMatchesOrderBlock(direction, orderBlock.direction)) {
    return "WAIT";
  }

  if (orderBlock.strength !== "strong") {
    return "WAIT";
  }

  if (!orderBlock.touched) {
    return "WAIT";
  }

  if (!hasOrderBlockPriceActionConfirmation(analysis, direction)) {
    return "WAIT";
  }

  return decision;
}

function applyLiquidityDecisionGuard({ analysis, decision }: { analysis: TechnicalAnalysis; decision: Signal }) {
  if (decision === "WAIT") {
    return decision;
  }

  if (analysis.liquidity.sweepDetected && !analysis.liquidity.rejectionConfirmed && !analysis.liquidity.realBreakoutContinuation) {
    return "WAIT";
  }

  return decision;
}

function getConservativeMissingConditions({
  analysis,
  direction,
  news,
  redNewsNearby,
  riskReward,
  score,
}: {
  analysis: TechnicalAnalysis;
  direction: Direction;
  news: NewsEvent[];
  redNewsNearby: boolean;
  riskReward: number;
  score: number;
}) {
  void news;
  return [
    redNewsNearby ? "No red USD news risk" : null,
    analysis.liquidity.sweepDetected && !analysis.liquidity.rejectionConfirmed && !analysis.liquidity.realBreakoutContinuation ? "Liquidity confirmation after sweep" : null,
    score >= 75 ? null : "Confidence >= 75",
    riskReward >= 1.2 ? null : "Risk/reward above 1:1.2",
    analysis.orderBlock?.strength === "strong" ? null : "Strong Order Block",
    analysis.orderBlock?.touched ? null : "OB retest/touch",
    hasOrderBlockPriceActionConfirmation(analysis, direction) ? null : "Price action confirmation",
    analysis.volatility !== "trop dangereuse" ? null : "Volatility below danger zone",
  ].filter(Boolean) as string[];
}

function isStrongTouchedOrderBlock(analysis: TechnicalAnalysis, direction: Direction) {
  const orderBlock = analysis.orderBlock;

  return Boolean(orderBlock && orderBlock.strength === "strong" && orderBlock.touched && directionMatchesOrderBlock(direction, orderBlock.direction));
}

function hasOrderBlockPriceActionConfirmation(analysis: TechnicalAnalysis, direction: Direction) {
  const structureConfirmed = (direction === "Bullish" && analysis.structure === "BOS") || (direction === "Bearish" && analysis.structure === "CHoCH");

  return Boolean(
    analysis.retestConfirmed ||
      structureConfirmed ||
      analysis.liquiditySweep ||
      analysis.fvg ||
      (analysis.displacement && analysis.ema20 !== analysis.ema50),
  );
}

function directionMatchesOrderBlock(direction: Direction, orderBlockDirection: NonNullable<TechnicalAnalysis["orderBlock"]>["direction"]) {
  return (direction === "Bullish" && orderBlockDirection === "bullish") || (direction === "Bearish" && orderBlockDirection === "bearish");
}

function isHigherTimeframeConflict(direction: Direction, higherTimeframe: HigherTimeframeContext) {
  if (!higherTimeframe.strong || direction === "Neutral") {
    return false;
  }

  return (direction === "Bullish" && higherTimeframe.trend === "bearish") || (direction === "Bearish" && higherTimeframe.trend === "bullish");
}

function isPriceNearActionZone({ analysis, price }: { analysis: TechnicalAnalysis; price: number }) {
  const atrDistance = Math.max(analysis.atr * 1.2, 0.75);

  if (analysis.orderBlock) {
    const zone = analysis.orderBlock;
    const inZone = price >= zone.low && price <= zone.high;
    const nearZone = Math.abs(price - zone.low) <= atrDistance || Math.abs(price - zone.high) <= atrDistance;

    return inZone || nearZone;
  }

  return Math.abs(price - analysis.support) <= atrDistance || Math.abs(price - analysis.resistance) <= atrDistance;
}

function hasRedNewsRisk({ fundamental, news }: { fundamental: FundamentalContext; news: NewsEvent[] }) {
  return fundamental.caution || news.some((event) => event.impact === "high" && event.minutesAway <= 30);
}

function getWaitReason(missingConditions: string[]) {
  if (missingConditions.includes("No red USD news risk")) {
    return "WAIT: news risk";
  }

  if (missingConditions.includes("Higher timeframe conflict must ease")) {
    return "WAIT: higher timeframe conflict";
  }

  if (missingConditions.includes("Short-term momentum")) {
    return "WAIT: no momentum";
  }

  if (missingConditions.includes("OB retest/touch") || missingConditions.includes("Micro BOS/CHoCH")) {
    return "WAIT: missing retest";
  }

  if (missingConditions.includes("Liquidity confirmation after sweep")) {
    return "WAIT: liquidity taken without confirmation";
  }

  if (missingConditions.includes("Price closer to zone/retest")) {
    return "WAIT: price too far from zone";
  }

  return missingConditions[0] ? `WAIT: ${missingConditions[0]}` : "WAIT: confirmation required";
}

function describeOrderBlock(analysis: TechnicalAnalysis) {
  const orderBlock = analysis.orderBlock;

  if (!orderBlock) {
    return "Aucun Order Block qualifie: WAIT tant qu'une zone >= 60/100 n'est pas validee.";
  }

  const label = orderBlock.direction === "bullish" ? "Bullish OB" : "Bearish OB";
  const touch = orderBlock.touched ? "prix dans la zone" : "retour zone attendu";
  const confirmation = hasOrderBlockPriceActionConfirmation(analysis, orderBlock.direction === "bullish" ? "Bullish" : "Bearish")
    ? "confirmation price action presente"
    : "confirmation price action requise";

  return `${label} ${orderBlock.strength} ${orderBlock.score}/100, ${touch}, ${confirmation}.`;
}

function getStopLoss(direction: Direction, price: number, support: number, resistance: number, fallbackDistance: number) {
  if (direction === "Bearish") {
    return resistance > price ? resistance + fallbackDistance * 0.25 : price + fallbackDistance;
  }

  return support > 0 && support < price ? support - fallbackDistance * 0.25 : price - fallbackDistance;
}

function getTakeProfits(direction: Direction, price: number, risk: number): [number, number, number] {
  return direction === "Bearish" ? [price - risk * 2, price - risk * 3, price - risk * 4] : [price + risk * 2, price + risk * 3, price + risk * 4];
}

function getPlanTimeframe(candleMap: Record<Timeframe, Candle[]>, mode: SignalMode, preferredTimeframe?: Timeframe): Timeframe {
  if (mode === "scalping") {
    if (preferredTimeframe && SCALPING_TIMEFRAMES.includes(preferredTimeframe) && candleMap[preferredTimeframe].length >= MIN_ANALYSIS_CANDLES) {
      return preferredTimeframe;
    }

    return SCALPING_TIMEFRAMES.find((timeframe) => candleMap[timeframe].length >= MIN_ANALYSIS_CANDLES) ?? "M5";
  }

  if (candleMap.H1.length >= MIN_ANALYSIS_CANDLES) {
    return "H1";
  }

  if (candleMap.M15.length >= MIN_ANALYSIS_CANDLES) {
    return "M15";
  }

  return timeframes.find((timeframe) => candleMap[timeframe].length >= MIN_ANALYSIS_CANDLES) ?? "M15";
}

function summarizeDecision(decision: Signal, direction: Direction, mode: SignalMode) {
  if (decision === "STRONG BUY" || decision === "STRONG SELL") {
    return `Biais ${direction.toLowerCase()} fort en mode conservateur.`;
  }

  if (decision === "BUY SCALP" || decision === "SELL SCALP") {
    return `Setup scalp ${direction.toLowerCase()} actif en ${mode}.`;
  }

  return mode === "scalping"
    ? "Attente scalp: il manque une condition micro-structure ou risque."
    : "Attente conservative: confirmations fortes insuffisantes, OB non valide ou RR non optimal.";
}

function emptyTimeframeAnalysis({
  mode,
  newsNearby,
  timeframe,
  waitReason,
}: {
  mode: SignalMode;
  newsNearby: boolean;
  timeframe: Timeframe;
  waitReason: string;
}): TimeframeAnalysis {
  return {
    timeframe,
    signal: "WAIT",
    signalMode: mode,
    waitReason,
    missingConditions: ["Live candles"],
    score: 0,
    trend: "range",
    rsi: 50,
    atr: 0,
    structure: "range",
    support: 0,
    resistance: 0,
    liquiditySweep: false,
    retestConfirmed: false,
    volatility: "calme",
    newsNearby,
    orderBlock: null,
    liquidity: null,
    riskReward: 0,
    summary: waitReason,
  };
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

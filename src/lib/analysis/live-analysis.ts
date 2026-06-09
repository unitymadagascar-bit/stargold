import type {
  Candle,
  Direction,
  FundamentalContext,
  MacroContext,
  MovingAverageType,
  NewsEvent,
  OrbDuration,
  ScalpingSensitivity,
  Signal,
  SignalMode,
  RiskSettings,
  AccountRiskSummary,
  SymbolProfile,
  TechnicalAnalysis,
  Timeframe,
  TimeframeAnalysis,
  TradePlan,
  Trend,
  TrendFilterAnalysis,
} from "@/types";
import { analyzeCandles } from "@/lib/analysis/market-structure";
import { detectLiquidityAnalysis } from "@/lib/analysis/liquidity";
import { detectFvgAnalysis, fvgDirectionMatches } from "@/lib/analysis/fvg";
import { detectOrderBlock } from "@/lib/analysis/order-blocks";
import { detectOrbAnalysis } from "@/lib/analysis/orb";
import { getAnalysisEngine, type SymbolAnalysisEngine } from "@/lib/analysis/symbol-engines";
import { timeframes } from "@/lib/market/timeframes";
import { getSymbolProfile } from "@/lib/symbols/profiles";
import { buildAccountRiskSummary, calculateLotSize, calculateRiskReward, defaultRiskSettings, normalizeRiskSettings } from "@/lib/risk/risk";
import { generateFinalDecision, inferDirection } from "@/lib/scoring/confluence";
import { applyFundamentalDecisionGuard, calculateFundamentalDecisionScore, getDecisionStrength, hasRequiredTechnicalConfirmation } from "@/lib/fundamentals/decision-score";
import { calculateEMA, calculateSMA, lastValue } from "@/lib/indicators";

const MIN_ANALYSIS_CANDLES = 30;
const SCALPING_TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15"];
const sensitivityProfiles: Record<
  ScalpingSensitivity,
  { minConditions: number; minRiskReward: number; readyThreshold: number; watchThreshold: number }
> = {
  safe: { minConditions: 4, minRiskReward: 1.0, readyThreshold: 60, watchThreshold: 52 },
  balanced: { minConditions: 3, minRiskReward: 1.0, readyThreshold: 58, watchThreshold: 50 },
  aggressive: { minConditions: 3, minRiskReward: 1.0, readyThreshold: 58, watchThreshold: 48 },
};

interface DecisionResult {
  signal: Signal;
  confidence: number;
  waitReason: string;
  missingConditions: string[];
}

interface EntryQualityResult {
  bias: "Buy" | "Sell" | "Neutral";
  blocked: boolean;
  confirmation: "Confirmed" | "Not confirmed";
  reason: string;
  riskLevel: "Low" | "Medium" | "High";
  waitFor: string;
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
  analysisSource = null,
  candleMap,
  fundamental,
  macro,
  mode = "conservative",
  movingAveragePeriod = 50,
  movingAverageType = "EMA",
  news,
  orbDuration = 30,
  orbRequireRetest = false,
  scalpingSensitivity = "balanced",
  spread = null,
  symbolProfile = getSymbolProfile("XAUUSD"),
}: {
  analysisSource?: string | null;
  candleMap: Record<Timeframe, Candle[]>;
  fundamental: FundamentalContext;
  macro: MacroContext;
  mode?: SignalMode;
  movingAveragePeriod?: number;
  movingAverageType?: MovingAverageType;
  news: NewsEvent[];
  orbDuration?: OrbDuration;
  orbRequireRetest?: boolean;
  scalpingSensitivity?: ScalpingSensitivity;
  spread?: number | null;
  symbolProfile?: SymbolProfile;
}): TimeframeAnalysis[] {
  void macro;
  const higherTimeframe = getHigherTimeframeContext(candleMap);
  const redNewsNearby = hasRedNewsRisk({ fundamental, news });
  const engine = getAnalysisEngine(symbolProfile);

  return timeframes.map((timeframe) => {
    const candles = candleMap[timeframe];

    if (candles.length < MIN_ANALYSIS_CANDLES) {
      return emptyTimeframeAnalysis({
        missingCondition: getInsufficientDataCondition(symbolProfile),
        mode,
        newsNearby: redNewsNearby,
        scalpingSensitivity,
        timeframe,
        waitReason: getInsufficientDataWaitReason(symbolProfile),
      });
    }

    const baseAnalysis = analyzeCandles(candles);
    const price = candles.at(-1)?.close ?? 0;
    const direction = inferDirection(baseAnalysis);
    const stopLoss = getStopLoss(direction, price, baseAnalysis.support, baseAnalysis.resistance, baseAnalysis.atr);
    const target = direction === "Bearish" ? price - Math.abs(price - stopLoss) * 2 : price + Math.abs(price - stopLoss) * 2;
    const riskReward = calculateRiskReward(price, stopLoss, target);
    const analysis = withOrderBlock({ analysis: baseAnalysis, candles, engine, higherTimeframeTrend: higherTimeframe.trend, movingAveragePeriod, movingAverageType, newsRisk: redNewsNearby, orbDuration, orbRequireRetest, riskReward, spread, timeframe });
    const scoring = calculateFundamentalDecisionScore({ analysis, direction, fundamental, riskReward });
    const decision = evaluateSignal({
      analysis,
      analysisSource,
      candles,
      conservativeScore: scoring.total,
      direction,
      fundamental,
      higherTimeframe,
      mode,
      news,
      redNewsNearby,
      riskReward,
      scalpingSensitivity,
      spread,
      symbolProfile,
      timeframe,
    });

    return {
      timeframe,
      signal: decision.signal,
      signalMode: mode,
      scalpingSensitivity,
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
      fvg: analysis.fvgAnalysis,
      orb: analysis.orb,
      trendFilter: analysis.trendFilter,
      riskReward: Number(riskReward.toFixed(2)),
      summary: `${decision.waitReason}. ${decision.missingConditions.length ? `Missing: ${decision.missingConditions.join(", ")}.` : "Conditions validees."}`,
    };
  });
}

export function buildLiveTradePlan({
  analysisSource = null,
  candleMap,
  fundamental,
  macro,
  mode = "conservative",
  movingAveragePeriod = 50,
  movingAverageType = "EMA",
  news,
  orbDuration = 30,
  orbRequireRetest = false,
  preferredTimeframe,
  riskSettings = defaultRiskSettings,
  scalpingSensitivity = "balanced",
  spread = null,
  symbolProfile = getSymbolProfile("XAUUSD"),
}: {
  analysisSource?: string | null;
  candleMap: Record<Timeframe, Candle[]>;
  fundamental: FundamentalContext;
  macro: MacroContext;
  mode?: SignalMode;
  movingAveragePeriod?: number;
  movingAverageType?: MovingAverageType;
  news: NewsEvent[];
  orbDuration?: OrbDuration;
  orbRequireRetest?: boolean;
  preferredTimeframe?: Timeframe;
  riskSettings?: RiskSettings;
  scalpingSensitivity?: ScalpingSensitivity;
  spread?: number | null;
  symbolProfile?: SymbolProfile;
}): TradePlan {
  void macro;
  const analysisTimeframe = getPlanTimeframe(candleMap, mode, preferredTimeframe);
  const normalizedRiskSettings = normalizeRiskSettings(riskSettings);
  const candles = candleMap[analysisTimeframe];
  const price = getLatestPrice(candleMap);

  if (!price || candles.length < MIN_ANALYSIS_CANDLES) {
    const cryptoVisualOnly = isTradingViewCryptoVisualProfile(symbolProfile);
    const waitReason = getInsufficientDataWaitReason(symbolProfile);
    const missingCondition = getInsufficientDataCondition(symbolProfile);

    return {
      direction: "Neutral",
      decision: "WAIT",
      directionalBias: "Neutral",
      entryConfirmation: "Not confirmed",
      entryRiskLevel: "High",
      signalReason: waitReason,
      waitFor: missingCondition,
      signalMode: mode,
      scalpingSensitivity,
      waitReason,
      missingConditions: [missingCondition],
      score: 0,
      summary: cryptoVisualOnly
        ? `Mode Crypto actif via TradingView fallback pour ${symbolProfile.symbol}. Le graphique reste disponible; l'analyse avancee automatique passe en visual-only tant qu'aucun flux OHLC crypto interne n'est disponible.`
        : `Flux live ${symbolProfile.symbol} requis pour calculer un plan fiable. Aucun signal n'est genere depuis des donnees fictives.`,
      entry: price,
      stopLoss: 0,
      takeProfits: [0, 0, 0],
      riskReward: 0,
      lotSize: 0,
      alerts: cryptoVisualOnly
        ? [
            "TradingView Crypto est actif pour le graphique.",
            "Source analyse: TradingView visual mode, sans Crypto OHLC Feed pour calculer un BUY/SELL automatique.",
            "Le moteur Crypto produira BUY / SELL / WAIT des qu'un flux OHLC crypto exploitable sera disponible.",
          ]
        : ["Aucune donnee mock n'est utilisee pour le graphique.", `Connecte un flux ${symbolProfile.symbol} temps reel pour activer le plan.`],
      scoring: { technical: 0, orderFlow: 0, fundamental: 0, risk: 0, total: 0 },
      orderBlock: null,
      liquidity: null,
      fvg: null,
      orb: null,
      trendFilter: null,
      accountRisk: buildAccountRiskSummary(normalizedRiskSettings, 0),
    };
  }

  const higherTimeframe = getHigherTimeframeContext(candleMap);
  const engine = getAnalysisEngine(symbolProfile);
  const baseAnalysis = analyzeCandles(candles);
  const direction = inferDirection(baseAnalysis);
  const riskUnit = Math.max(baseAnalysis.atr * 1.25, price * 0.001);
  const stopLoss = getStopLoss(direction, price, baseAnalysis.support, baseAnalysis.resistance, riskUnit);
  const takeProfits = getTakeProfits(direction, price, Math.abs(price - stopLoss));
  const riskReward = calculateRiskReward(price, stopLoss, takeProfits[0]);
  const redNewsNearby = hasRedNewsRisk({ fundamental, news });
  const analysis = withOrderBlock({ analysis: baseAnalysis, candles, engine, higherTimeframeTrend: higherTimeframe.trend, movingAveragePeriod, movingAverageType, newsRisk: redNewsNearby, orbDuration, orbRequireRetest, riskReward, spread, timeframe: analysisTimeframe });
  const scoring = calculateFundamentalDecisionScore({ analysis, direction, fundamental, riskReward });
  const decision = evaluateSignal({
    analysis,
    analysisSource,
    candles,
    conservativeScore: scoring.total,
    direction,
    fundamental,
    higherTimeframe,
    mode,
    news,
    redNewsNearby,
    riskReward,
    scalpingSensitivity,
    spread,
    symbolProfile,
    timeframe: analysisTimeframe,
  });
  const orbPlan = analysis.orb && analysis.orb.direction !== "Neutral" ? analysis.orb : null;
  const fvgPlan = analysis.fvgAnalysis;
  const planDirection = orbPlan?.direction ?? direction;
  const plannedEntry = getPlannedEntry({ fvg: fvgPlan, orb: orbPlan, price });
  const plannedStopLoss = round(orbPlan ? orbPlan.stopLoss : stopLoss);
  const plannedTakeProfits = getPlannedTakeProfits({ direction: planDirection, fallbackTakeProfits: takeProfits, orb: orbPlan, support: analysis.support, resistance: analysis.resistance });
  const plannedRiskReward = plannedEntry && plannedStopLoss ? calculateRiskReward(plannedEntry, plannedStopLoss, plannedTakeProfits[0]) : riskReward;
  const plannedStopDistance = Math.abs(plannedEntry - plannedStopLoss);
  const entryQuality = evaluateEntryQuality({ analysis, candles, direction: planDirection });
  const entryAdjustedDecision = applyEntryQualityGuard(decision, entryQuality);
  const accountRisk = buildAccountRiskSummary(normalizedRiskSettings, plannedStopDistance);
  const riskAdjustedDecision = applyAccountRiskGuard(entryAdjustedDecision, accountRisk);

  return {
    direction: planDirection,
    decision: riskAdjustedDecision.signal,
    directionalBias: entryQuality.bias,
    entryConfirmation: entryQuality.confirmation,
    entryRiskLevel: entryQuality.riskLevel,
    signalReason: entryQuality.reason,
    waitFor: entryQuality.waitFor,
    signalMode: mode,
    scalpingSensitivity,
    waitReason: riskAdjustedDecision.waitReason,
    missingConditions: riskAdjustedDecision.missingConditions,
    score: riskAdjustedDecision.confidence,
    summary: `${summarizeDecision(riskAdjustedDecision.signal, direction, mode)} ${riskAdjustedDecision.waitReason}. ${describeOrderBlock(analysis)} ${describeOrbFvg(analysis)} ${fundamental.cautionMessage ?? getDecisionStrength(scoring.total)}.`,
    entry: round(plannedEntry),
    stopLoss: plannedStopLoss,
    takeProfits: plannedTakeProfits,
    riskReward: Number(plannedRiskReward.toFixed(2)),
    lotSize: calculateLotSize({ capital: normalizedRiskSettings.capital, riskPercent: normalizedRiskSettings.riskPercent, stopLossDistance: plannedStopDistance, pipValue: normalizedRiskSettings.pipValue }),
    alerts: [
      riskAdjustedDecision.waitReason,
      ...riskAdjustedDecision.missingConditions.map((condition) => `Missing before signal: ${condition}`),
      accountRisk.riskWarning ? `Capital/risk guard: ${accountRisk.riskWarning}` : `Capital guard OK: max loss $${accountRisk.maxLoss.toFixed(2)}, lot ${calculateLotSize({ capital: normalizedRiskSettings.capital, riskPercent: normalizedRiskSettings.riskPercent, stopLossDistance: plannedStopDistance, pipValue: normalizedRiskSettings.pipValue }).toFixed(2)}.`,
      "TP1 default is RR 1:1; take partial profit at TP1.",
      "After TP1 is reached, move Stop Loss to Break Even.",
      mode === "scalping" ? "Scalping has higher risk and requires strict stop loss." : "Conservative mode requires stronger confirmation.",
      analysis.liquiditySweep ? "Liquidity sweep detecte sur les bougies live." : "Pas de sweep confirme pour l'instant.",
      describeOrderBlock(analysis),
      analysis.orb ? `${analysis.orb.status}: ${analysis.orb.missingConfirmation}` : `${engine.settings.name}: ${symbolProfile.strategy}`,
      analysis.fvgAnalysis ? `FVG ${analysis.fvgAnalysis.direction} ${analysis.fvgAnalysis.score}/100, fill ${analysis.fvgAnalysis.fillPercent}%: ${analysis.fvgAnalysis.missingConfirmation}` : "No fresh M1/M5/M15 FVG confirmation.",
      "Order Block is an analysis zone, not a guaranteed entry.",
      fundamental.usdInterpretation,
    ],
    scoring,
    orderBlock: analysis.orderBlock,
    liquidity: analysis.liquidity,
    fvg: analysis.fvgAnalysis,
    orb: analysis.orb,
    trendFilter: analysis.trendFilter,
    accountRisk,
  };
}

function evaluateSignal({
  analysis,
  analysisSource,
  candles,
  conservativeScore,
  direction,
  fundamental,
  higherTimeframe,
  mode,
  news,
  redNewsNearby,
  riskReward,
  scalpingSensitivity,
  spread,
  symbolProfile,
  timeframe,
}: {
  analysis: TechnicalAnalysis;
  analysisSource: string | null;
  candles: Candle[];
  conservativeScore: number;
  direction: Direction;
  fundamental: FundamentalContext;
  higherTimeframe: HigherTimeframeContext;
  mode: SignalMode;
  news: NewsEvent[];
  redNewsNearby: boolean;
  riskReward: number;
  scalpingSensitivity: ScalpingSensitivity;
  spread: number | null;
  symbolProfile: SymbolProfile;
  timeframe: Timeframe;
}): DecisionResult {
  const engine = getAnalysisEngine(symbolProfile);

  if (symbolProfile.symbol !== "XAUUSD") {
    const engineDecision = engine.evaluateEducationalDecision({ analysis, direction, redNewsNearby, riskReward, spread });

    if (isCryptoScalpingUnsynced(symbolProfile, analysisSource) && isActionableSignal(engineDecision.signal)) {
      return {
        confidence: Math.min(engineDecision.confidence, 49),
        missingConditions: ["Exness/MT5 Bridge sync"],
        signal: "WAIT",
        waitReason: "NOT SYNCED: external crypto price may differ from Exness, scalping disabled",
      };
    }

    return {
      confidence: engineDecision.confidence,
      missingConditions: engineDecision.missingConditions,
      signal: engineDecision.signal,
      waitReason: engineDecision.waitReason,
    };
  }

  if (mode === "scalping") {
    return evaluateScalpingSignal({ analysis, candles, direction, higherTimeframe, redNewsNearby, riskReward, scalpingSensitivity, timeframe });
  }

  return evaluateConservativeSignal({ analysis, conservativeScore, direction, fundamental, news, redNewsNearby, riskReward });
}

function isActionableSignal(signal: Signal) {
  return signal === "BUY" || signal === "SELL" || signal === "BUY SCALP READY" || signal === "SELL SCALP READY" || signal === "STRONG BUY" || signal === "STRONG SELL";
}

function applyAccountRiskGuard(decision: DecisionResult, accountRisk: AccountRiskSummary): DecisionResult {
  if (accountRisk.positionAllowed || !isActionableSignal(decision.signal)) {
    return decision;
  }

  const riskWarning = accountRisk.riskWarning ?? "Capital/risk settings must be validated before execution.";

  return {
    confidence: Math.min(decision.confidence, 49),
    missingConditions: [riskWarning, ...decision.missingConditions],
    signal: "WAIT",
    waitReason: `WAIT: ${riskWarning}`,
  };
}

function applyEntryQualityGuard(decision: DecisionResult, entryQuality: EntryQualityResult): DecisionResult {
  if (!isActionableSignal(decision.signal)) {
    return decision;
  }

  if (entryQuality.confirmation === "Confirmed" && !entryQuality.blocked) {
    return decision;
  }

  return {
    confidence: Math.min(decision.confidence, 49),
    missingConditions: [entryQuality.waitFor, ...decision.missingConditions],
    signal: "WAIT",
    waitReason: `WAIT: ${entryQuality.reason}`,
  };
}

function evaluateEntryQuality({ analysis, candles, direction }: { analysis: TechnicalAnalysis; candles: Candle[]; direction: Direction }): EntryQualityResult {
  const bias = direction === "Bullish" ? "Buy" : direction === "Bearish" ? "Sell" : "Neutral";
  const last = candles.at(-1);

  if (!last || direction === "Neutral" || candles.length < 20) {
    return {
      bias,
      blocked: true,
      confirmation: "Not confirmed",
      reason: "Neutral bias or insufficient candles.",
      riskLevel: "High",
      waitFor: "Wait for clear bias, break, FVG and retest.",
    };
  }

  const pricePosition = evaluatePricePosition({ analysis, candles, direction });
  const sweep = detectRecentLiquidityReversal(candles, analysis.atr);
  const breakRetest = detectBreakRetestConfirmation(candles, analysis.atr, direction);
  const fvgConfirmed = Boolean(
    analysis.fvgAnalysis &&
      fvgDirectionMatches(analysis.fvgAnalysis.direction, direction) &&
      analysis.fvgAnalysis.touched &&
      analysis.fvgAnalysis.rejectionConfirmed &&
      analysis.fvgAnalysis.fillState !== "invalid" &&
      analysis.fvgAnalysis.fillState !== "full",
  );

  const sweepBlocksSell = direction === "Bearish" && sweep.bullish;
  const sweepBlocksBuy = direction === "Bullish" && sweep.bearish;
  const priceBlocksSell = direction === "Bearish" && (pricePosition.nearSupport || pricePosition.extendedDown);
  const priceBlocksBuy = direction === "Bullish" && (pricePosition.nearResistance || pricePosition.extendedUp);
  const blocked = sweepBlocksSell || sweepBlocksBuy || priceBlocksSell || priceBlocksBuy;

  if (sweepBlocksSell) {
    return {
      bias,
      blocked: true,
      confirmation: "Not confirmed",
      reason: "Sell bias, but entry blocked. Possible bullish liquidity sweep.",
      riskLevel: "High",
      waitFor: "Wait for bearish break + retest.",
    };
  }

  if (sweepBlocksBuy) {
    return {
      bias,
      blocked: true,
      confirmation: "Not confirmed",
      reason: "Buy bias, but entry blocked. Possible bearish liquidity sweep.",
      riskLevel: "High",
      waitFor: "Wait for bullish break + retest.",
    };
  }

  if (priceBlocksSell) {
    return {
      bias,
      blocked: true,
      confirmation: "Not confirmed",
      reason: "Sell bias, but entry blocked. Price is near support or already extended down.",
      riskLevel: "High",
      waitFor: "Wait for bearish break + retest.",
    };
  }

  if (priceBlocksBuy) {
    return {
      bias,
      blocked: true,
      confirmation: "Not confirmed",
      reason: "Buy bias, but entry blocked. Price is near resistance or already extended up.",
      riskLevel: "High",
      waitFor: "Wait for bullish break + retest.",
    };
  }

  if (!breakRetest.confirmed) {
    return {
      bias,
      blocked,
      confirmation: "Not confirmed",
      reason: `${bias} bias, but entry blocked. ${breakRetest.reason}`,
      riskLevel: "Medium",
      waitFor: direction === "Bullish" ? "Wait for bullish break + rejected retest." : "Wait for bearish break + rejected retest.",
    };
  }

  if (!fvgConfirmed) {
    return {
      bias,
      blocked,
      confirmation: "Not confirmed",
      reason: `${bias} bias, but entry blocked. FVG retest with rejection is missing.`,
      riskLevel: "Medium",
      waitFor: direction === "Bullish" ? "Wait for bullish FVG retest + rejection." : "Wait for bearish FVG retest + rejection.",
    };
  }

  return {
    bias,
    blocked: false,
    confirmation: "Confirmed",
    reason: `${bias} entry confirmed: break, rejected retest and FVG confirmation aligned.`,
    riskLevel: analysis.volatility === "volatile" ? "Medium" : "Low",
    waitFor: "Final spread/news/risk check before execution.",
  };
}

function evaluatePricePosition({ analysis, candles, direction }: { analysis: TechnicalAnalysis; candles: Candle[]; direction: Direction }) {
  const last = candles.at(-1);
  const recent = candles.slice(-24);
  const price = last?.close ?? 0;
  const atr = Math.max(analysis.atr, price * 0.0001, 0.01);
  const swingLow = Math.min(...recent.slice(0, -1).map((candle) => candle.low));
  const swingHigh = Math.max(...recent.slice(0, -1).map((candle) => candle.high));
  const range = Math.max(swingHigh - swingLow, atr);
  const nearSupport = price <= analysis.support + atr * 0.7 || price <= swingLow + atr * 0.9;
  const nearResistance = price >= analysis.resistance - atr * 0.7 || price >= swingHigh - atr * 0.9;
  const extendedDown = direction === "Bearish" && swingHigh - price >= Math.max(atr * 2.8, range * 0.68);
  const extendedUp = direction === "Bullish" && price - swingLow >= Math.max(atr * 2.8, range * 0.68);

  return { extendedDown, extendedUp, nearResistance, nearSupport };
}

function detectRecentLiquidityReversal(candles: Candle[], atr: number) {
  const recent = candles.slice(-7);
  const previous = candles.slice(-22, -7);

  if (recent.length < 2 || previous.length < 5) {
    return { bearish: false, bullish: false };
  }

  const swingLow = Math.min(...previous.map((candle) => candle.low));
  const swingHigh = Math.max(...previous.map((candle) => candle.high));

  return recent.reduce(
    (state, candle) => {
      const body = Math.max(Math.abs(candle.close - candle.open), atr * 0.05, 0.01);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const bullishSweep = candle.low < swingLow && candle.close > swingLow && lowerWick >= body * 1.35;
      const bearishSweep = candle.high > swingHigh && candle.close < swingHigh && upperWick >= body * 1.35;

      return {
        bearish: state.bearish || bearishSweep,
        bullish: state.bullish || bullishSweep,
      };
    },
    { bearish: false, bullish: false },
  );
}

function detectBreakRetestConfirmation(candles: Candle[], atr: number, direction: Direction) {
  const recent = candles.slice(-28);

  if (recent.length < 12 || direction === "Neutral") {
    return { confirmed: false, reason: "Not enough candles for break + retest confirmation." };
  }

  const search = recent.slice(8);

  for (let index = 0; index < search.length; index += 1) {
    const absoluteIndex = index + 8;
    const candle = recent[absoluteIndex];
    const before = recent.slice(Math.max(0, absoluteIndex - 8), absoluteIndex);
    const level = direction === "Bullish" ? Math.max(...before.map((item) => item.high)) : Math.min(...before.map((item) => item.low));
    const clearBreak = direction === "Bullish" ? candle.close > level + atr * 0.12 : candle.close < level - atr * 0.12;

    if (!clearBreak) {
      continue;
    }

    const after = recent.slice(absoluteIndex + 1);
    const rejectedRetest = after.some((item) => {
      if (direction === "Bullish") {
        const body = Math.max(Math.abs(item.close - item.open), atr * 0.05, 0.01);
        const lowerWick = Math.min(item.open, item.close) - item.low;
        return item.low <= level + atr * 0.45 && item.close > level && item.close >= item.open && lowerWick >= body * 0.55;
      }

      const body = Math.max(Math.abs(item.close - item.open), atr * 0.05, 0.01);
      const upperWick = item.high - Math.max(item.open, item.close);
      return item.high >= level - atr * 0.45 && item.close < level && item.close <= item.open && upperWick >= body * 0.55;
    });

    if (rejectedRetest) {
      return { confirmed: true, reason: "Break + rejected retest confirmed." };
    }

    return {
      confirmed: false,
      reason: direction === "Bullish" ? "Bullish break detected, but rejected retest is missing." : "Bearish break detected, but rejected retest is missing.",
    };
  }

  return {
    confirmed: false,
    reason: direction === "Bullish" ? "No clear close above recent swing high yet." : "No clear close below recent swing low yet.",
  };
}

function isCryptoScalpingUnsynced(symbolProfile: SymbolProfile, analysisSource: string | null) {
  return isTradingViewCryptoVisualProfile(symbolProfile) && !isExnessExecutionSource(analysisSource);
}

function isExnessExecutionSource(source: string | null) {
  if (!source) {
    return false;
  }

  const normalized = source.toLowerCase();
  return normalized.includes("mt5") || normalized.includes("exness") || normalized.includes("bridge");
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
  direction: fallbackDirection,
  higherTimeframe,
  redNewsNearby,
  riskReward,
  scalpingSensitivity,
  timeframe,
}: {
  analysis: TechnicalAnalysis;
  candles: Candle[];
  direction: Direction;
  higherTimeframe: HigherTimeframeContext;
  redNewsNearby: boolean;
  riskReward: number;
  scalpingSensitivity: ScalpingSensitivity;
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

  const orb = analysis.orb;
  const fvg = analysis.fvgAnalysis;
  const setupDirection = orb?.direction && orb.direction !== "Neutral" ? orb.direction : fallbackDirection;
  const micro = evaluateMicroStructure(candles, analysis, setupDirection);
  const profile = sensitivityProfiles[scalpingSensitivity];
  const higherTimeframeConflict = isHigherTimeframeConflict(setupDirection, higherTimeframe);
  const strongMaConflict = Boolean(analysis.trendFilter?.strongAgainst);
  const spreadOk = orb?.spreadOk ?? true;
  const atrOk = orb?.atrOk ?? micro.atrOk;
  const readyConfirmation = fvg?.rejectionConfirmed || micro.rejection || micro.microBos || (micro.momentum && fvg?.touched);
  const fvgMatches = Boolean(fvg && fvgDirectionMatches(fvg.direction, setupDirection));
  const fvgFreshEnough = Boolean(fvg && fvg.fillState !== "invalid" && fvg.fillState !== "full");
  const confidence = clamp(
    (orb?.confidence ?? 0) * 0.42 +
      (fvg?.score ?? 0) * 0.36 +
      (fvg?.touched ? 7 : 0) +
      (readyConfirmation ? 13 : 0) +
      (micro.momentum ? 5 : 0) +
      (analysis.trendFilter?.bias === setupDirection ? 4 : 0) -
      (strongMaConflict ? 18 : 0),
    100,
  );
  const baseMissing = [
    redNewsNearby ? "No red USD news risk" : null,
    higherTimeframeConflict ? "Higher timeframe is strongly opposite" : null,
    strongMaConflict ? "MA trend not strongly against setup" : null,
    spreadOk ? null : "Spread safe",
    atrOk ? null : "ATR acceptable",
    riskReward >= profile.minRiskReward ? null : `Risk/reward >= 1:${profile.minRiskReward.toFixed(1)}`,
  ].filter(Boolean) as string[];

  if (redNewsNearby) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: red USD news risk", missingConditions: baseMissing };
  }

  if (analysis.volatility === "trop dangereuse") {
    return { signal: "WAIT", confidence, waitReason: "WAIT: volatility danger zone", missingConditions: ["Volatility below danger zone", ...baseMissing] };
  }

  if (higherTimeframeConflict) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: higher timeframe strongly opposite", missingConditions: baseMissing };
  }

  if (strongMaConflict) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: MA trend clearly against setup", missingConditions: baseMissing };
  }

  if (!orb) {
    return { signal: "WAIT", confidence: 0, waitReason: "WAIT: no 30-minute ORB session range yet", missingConditions: ["30-minute ORB range formed", ...baseMissing] };
  }

  if (orb.status === "FORMING" || orb.direction === "Neutral") {
    return {
      signal: "WAIT",
      confidence: orb.confidence,
      waitReason: "WAIT: opening range formed, no close outside high/low yet",
      missingConditions: ["Candle close outside 30-minute OR high/low", ...baseMissing],
    };
  }

  if (orb.status === "ORB FAILED" || orb.fakeBreakout) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: ORB failed/fake breakout", missingConditions: ["ORB not failed", ...baseMissing] };
  }

  if (!spreadOk) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: spread too wide for scalp", missingConditions: baseMissing };
  }

  if (!fvgMatches) {
    return {
      signal: "ORB BREAKOUT WATCH",
      confidence,
      waitReason: "ORB BREAKOUT WATCH: breakout happened, waiting for a same-direction FVG",
      missingConditions: ["FVG created after ORB breakout", ...baseMissing],
    };
  }

  if (!fvgFreshEnough && !fvg?.rejectionConfirmed) {
    return { signal: "WAIT", confidence, waitReason: "WAIT: FVG fully filled without rejection", missingConditions: ["Fresh or partial FVG only", ...baseMissing] };
  }

  if (!fvg?.touched) {
    return {
      signal: "ORB BREAKOUT WATCH",
      confidence,
      waitReason: "ORB BREAKOUT WATCH: valid breakout created FVG, wait for FVG retest",
      missingConditions: ["FVG retest", ...baseMissing],
    };
  }

  if (!readyConfirmation) {
    return {
      signal: "FVG RETEST WATCH",
      confidence,
      waitReason: "FVG RETEST WATCH: price retests FVG, waiting for M1 rejection/confirmation",
      missingConditions: ["M1 rejection/confirmation after FVG retest", ...baseMissing],
    };
  }

  if (confidence < profile.readyThreshold) {
    return {
      signal: "FVG RETEST WATCH",
      confidence,
      waitReason: "FVG RETEST WATCH: confirmation exists but confidence is still below SCALP READY",
      missingConditions: [`Confidence >= ${profile.readyThreshold}% for SCALP READY`, ...baseMissing],
    };
  }

  if (confidence >= 75) {
    return {
      signal: setupDirection === "Bullish" ? "STRONG BUY" : "STRONG SELL",
      confidence,
      waitReason: `${setupDirection === "Bullish" ? "STRONG BUY" : "STRONG SELL"}: ORB breakout, FVG retest and M1 confirmation aligned`,
      missingConditions: [],
    };
  }

  return {
    signal: setupDirection === "Bullish" ? "BUY SCALP READY" : "SELL SCALP READY",
    confidence,
    waitReason: `${setupDirection === "Bullish" ? "BUY" : "SELL"} SCALP READY: FVG retest plus M1 confirmation detected`,
    missingConditions: [],
  };
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
      obZoneNearby: false,
      supportResistanceNearby: false,
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
  const obZoneNearby = isPriceNearOrderBlock({ analysis, price: last.close });
  const supportResistanceNearby = isPriceNearSupportResistance({ analysis, price: last.close });
  const zoneOk = obZoneNearby || supportResistanceNearby;
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

  return { atrOk, confidence, direction, microBos, momentum, obZoneNearby, rejection, supportResistanceNearby, sweep, zoneOk };
}

function getPlannedEntry({
  fvg,
  orb,
  price,
}: {
  fvg: TechnicalAnalysis["fvgAnalysis"];
  orb: TechnicalAnalysis["orb"];
  price: number;
}) {
  if (fvg && orb?.direction === "Bullish") {
    return fvg.high;
  }

  if (fvg && orb?.direction === "Bearish") {
    return fvg.low;
  }

  if (orb?.direction === "Bullish") {
    return orb.entryZone.low;
  }

  if (orb?.direction === "Bearish") {
    return orb.entryZone.high;
  }

  return price;
}

function getPlannedTakeProfits({
  direction,
  fallbackTakeProfits,
  orb,
  resistance,
  support,
}: {
  direction: Direction;
  fallbackTakeProfits: [number, number, number];
  orb: TechnicalAnalysis["orb"];
  resistance: number;
  support: number;
}) {
  if (!orb || direction === "Neutral") {
    return fallbackTakeProfits.map(round) as [number, number, number];
  }

  const tp1 = orb.takeProfits[0];
  const rrTwo = orb.takeProfits[1];
  const liquidityTarget =
    direction === "Bullish" && resistance > tp1
      ? resistance
      : direction === "Bearish" && support > 0 && support < tp1
        ? support
        : rrTwo;
  const tp2 = direction === "Bullish" ? Math.max(rrTwo, liquidityTarget) : Math.min(rrTwo, liquidityTarget);

  return [tp1, tp2, tp2].map(round) as [number, number, number];
}

function withOrderBlock({
  analysis,
  candles,
  engine,
  higherTimeframeTrend,
  movingAveragePeriod,
  movingAverageType,
  newsRisk,
  orbDuration,
  orbRequireRetest,
  riskReward,
  spread,
  timeframe,
}: {
  analysis: TechnicalAnalysis;
  candles: Candle[];
  engine: SymbolAnalysisEngine;
  higherTimeframeTrend: Trend;
  movingAveragePeriod: number;
  movingAverageType: MovingAverageType;
  newsRisk: boolean;
  orbDuration: OrbDuration;
  orbRequireRetest: boolean;
  riskReward: number;
  spread: number | null;
  timeframe: Timeframe;
}): TechnicalAnalysis {
  const orb = engine.settings.useGoldOrb && ["M1", "M5", "M15"].includes(timeframe)
    ? detectOrbAnalysis({ atr: analysis.atr, candles, duration: orbDuration, newsSafe: !newsRisk, requireRetest: orbRequireRetest, spread })
    : null;
  const orbDirection = orb?.direction && orb.direction !== "Neutral" ? orb.direction : inferDirection(analysis);
  const fvgDirection = orbDirection === "Bullish" ? "bullish" : orbDirection === "Bearish" ? "bearish" : null;
  const fvgAnalysis = detectFvgAnalysis(candles, timeframe, { afterTime: engine.settings.useGoldOrb ? orb?.breakoutTime : null, direction: fvgDirection });
  const trendFilter = detectTrendFilter({ candles, direction: orbDirection, movingAveragePeriod, movingAverageType });

  return {
    ...analysis,
    orderBlock: detectOrderBlock({ candles, higherTimeframeTrend, riskReward }),
    liquidity: detectLiquidityAnalysis(candles, newsRisk),
    fvgAnalysis,
    orb,
    trendFilter,
  };
}

function detectTrendFilter({
  candles,
  direction,
  movingAveragePeriod,
  movingAverageType,
}: {
  candles: Candle[];
  direction: Direction;
  movingAveragePeriod: number;
  movingAverageType: MovingAverageType;
}): TrendFilterAnalysis | null {
  const closes = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value));
  const period = Math.max(5, Math.min(300, Math.round(movingAveragePeriod)));

  if (closes.length < Math.min(period, 20)) {
    return null;
  }

  const averageValues = movingAverageType === "SMA" ? calculateSMA(closes, period) : calculateEMA(closes, period);
  const value = lastValue(averageValues, closes.at(-1) ?? 0);
  const price = closes.at(-1) ?? value;
  const bias: Direction = price > value ? "Bullish" : price < value ? "Bearish" : "Neutral";
  const distancePercent = price > 0 ? Math.abs(price - value) / price * 100 : 0;
  const strongAgainst = direction !== "Neutral" && bias !== "Neutral" && bias !== direction && distancePercent >= 0.18;

  return {
    bias,
    distancePercent: Number(distancePercent.toFixed(2)),
    period,
    strongAgainst,
    type: movingAverageType,
    value: round(value),
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

  return Boolean(structureConfirmed || analysis.liquidity.rejectionConfirmed);
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

function getScalpingMissingConditions({
  higherTimeframeConflict,
  micro,
  minConditions,
  minRiskReward,
  readyConfirmation,
  redNewsNearby,
  riskReward,
  setupConditions,
  watchThreshold,
}: {
  higherTimeframeConflict: boolean;
  micro: ReturnType<typeof evaluateMicroStructure>;
  minConditions: number;
  minRiskReward: number;
  readyConfirmation: boolean;
  redNewsNearby: boolean;
  riskReward: number;
  setupConditions: string[];
  watchThreshold: number;
}) {
  return [
    redNewsNearby ? "No red USD news risk" : null,
    higherTimeframeConflict ? "Higher timeframe is strongly opposite" : null,
    micro.direction === "Neutral" ? "Clear M1/M5 micro direction" : null,
    setupConditions.length >= minConditions ? null : `At least ${minConditions} scalp setup conditions (${setupConditions.length}/${minConditions})`,
    micro.confidence >= watchThreshold ? null : `Confidence >= ${watchThreshold}% for WATCH`,
    readyConfirmation ? null : "Entry confirmation: rejection candle, micro BOS/CHoCH, or momentum from zone",
    riskReward >= minRiskReward ? null : `Risk/reward >= 1:${minRiskReward.toFixed(1)}`,
    micro.atrOk ? null : "ATR acceptable",
  ].filter(Boolean) as string[];
}

function getScalpingWaitReason(missingConditions: string[]) {
  if (missingConditions.includes("No red USD news risk")) {
    return "WAIT: red USD news risk";
  }

  if (missingConditions.includes("Higher timeframe is strongly opposite")) {
    return "WAIT: higher timeframe strongly opposite";
  }

  if (missingConditions.some((condition) => condition.startsWith("At least"))) {
    return "WAIT: no scalp setup yet";
  }

  if (missingConditions.some((condition) => condition.startsWith("Confidence"))) {
    return "WAIT: confidence too low for WATCH";
  }

  return missingConditions[0] ? `WAIT: ${missingConditions[0]}` : "WAIT: no setup";
}

function isPriceNearOrderBlock({ analysis, price }: { analysis: TechnicalAnalysis; price: number }) {
  const atrDistance = Math.max(analysis.atr * 1.2, 0.75);

  if (analysis.orderBlock) {
    const zone = analysis.orderBlock;
    const inZone = price >= zone.low && price <= zone.high;
    const nearZone = Math.abs(price - zone.low) <= atrDistance || Math.abs(price - zone.high) <= atrDistance;

    return inZone || nearZone;
  }

  return false;
}

function isPriceNearSupportResistance({ analysis, price }: { analysis: TechnicalAnalysis; price: number }) {
  const atrDistance = Math.max(analysis.atr * 1.2, 0.75);

  return Math.abs(price - analysis.support) <= atrDistance || Math.abs(price - analysis.resistance) <= atrDistance;
}

function zonesOverlap(firstLow: number, firstHigh: number, secondLow: number, secondHigh: number) {
  return firstHigh >= secondLow && firstLow <= secondHigh;
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

function describeOrbFvg(analysis: TechnicalAnalysis) {
  const orb = analysis.orb
    ? `${analysis.orb.status} ${analysis.orb.session} ORB ${analysis.orb.duration}m (${analysis.orb.confidence}/100): ${analysis.orb.missingConfirmation}`
    : "ORB en attente.";
  const fvg = analysis.fvgAnalysis
    ? `FVG ${analysis.fvgAnalysis.direction} ${analysis.fvgAnalysis.score}/100, fill ${analysis.fvgAnalysis.fillPercent}%, ${analysis.fvgAnalysis.fillState}: ${analysis.fvgAnalysis.missingConfirmation}`
    : "Aucun FVG frais M1/M5/M15.";

  return `${orb} ${fvg}`;
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
    if (candleMap.M1.length >= MIN_ANALYSIS_CANDLES) {
      return "M1";
    }

    if (preferredTimeframe && preferredTimeframe === "M5" && candleMap[preferredTimeframe].length >= MIN_ANALYSIS_CANDLES) {
      return preferredTimeframe;
    }

    return (["M1", "M5", "M15"] as Timeframe[]).find((timeframe) => candleMap[timeframe].length >= MIN_ANALYSIS_CANDLES) ?? "M5";
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
    return `Biais ${direction.toLowerCase()} fort.`;
  }

  if (decision === "BUY SCALP READY" || decision === "SELL SCALP READY") {
    return `Setup scalp ${direction.toLowerCase()} pret apres confirmation courte.`;
  }

  if (decision === "BUY" || decision === "SELL") {
    return `Setup ${direction.toLowerCase()} confirme par le moteur de categorie.`;
  }

  if (decision === "WATCH BUY" || decision === "WATCH SELL") {
    return `Setup scalp ${direction.toLowerCase()} en formation.`;
  }

  return mode === "scalping"
    ? "Attente scalp: il manque une condition micro-structure ou risque."
    : "Attente conservative: confirmations fortes insuffisantes, OB non valide ou RR non optimal.";
}

function emptyTimeframeAnalysis({
  missingCondition = "Live candles",
  mode,
  newsNearby,
  scalpingSensitivity,
  timeframe,
  waitReason,
}: {
  missingCondition?: string;
  mode: SignalMode;
  newsNearby: boolean;
  scalpingSensitivity: ScalpingSensitivity;
  timeframe: Timeframe;
  waitReason: string;
}): TimeframeAnalysis {
  return {
    timeframe,
    signal: "WAIT",
    signalMode: mode,
    scalpingSensitivity,
    waitReason,
    missingConditions: [missingCondition],
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
    fvg: null,
    orb: null,
    trendFilter: null,
    riskReward: 0,
    summary: waitReason,
  };
}

function getInsufficientDataWaitReason(symbolProfile: SymbolProfile) {
  if (isTradingViewCryptoVisualProfile(symbolProfile)) {
    return "TradingView visual mode: crypto chart active, Crypto OHLC Feed required for automated BUY/SELL analysis";
  }

  return "WAIT: not enough live candles";
}

function getInsufficientDataCondition(symbolProfile: SymbolProfile) {
  return isTradingViewCryptoVisualProfile(symbolProfile) ? "Crypto OHLC Feed" : "Live candles";
}

function isTradingViewCryptoVisualProfile(symbolProfile: SymbolProfile) {
  const symbol = symbolProfile.symbol.toUpperCase();
  return symbolProfile.category === "Crypto" && (symbol === "BTCUSD" || symbol === "BTCUSDT" || symbol === "ETHUSD" || symbol === "ETHUSDT");
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

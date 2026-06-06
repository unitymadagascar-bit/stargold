import type { Direction, Signal, SymbolProfile, TechnicalAnalysis } from "@/types";
import { fvgDirectionMatches } from "@/lib/analysis/fvg";

export interface EngineDecision {
  confidence: number;
  missingConditions: string[];
  signal: Signal;
  waitReason: string;
}

export interface EngineDecisionContext {
  analysis: TechnicalAnalysis;
  direction: Direction;
  redNewsNearby: boolean;
  riskReward: number;
  spread: number | null;
}

export interface EngineSettings {
  name: string;
  useGoldOrb: boolean;
  minConfidence: number;
  minRiskReward: number;
  volatilityStrictness: "normal" | "wide" | "strict";
}

export abstract class SymbolAnalysisEngine {
  constructor(public readonly profile: SymbolProfile) {}

  abstract get settings(): EngineSettings;

  evaluateEducationalDecision(context: EngineDecisionContext): EngineDecision {
    const { analysis, direction, redNewsNearby, riskReward, spread } = context;
    const fvgMatches = Boolean(analysis.fvgAnalysis && fvgDirectionMatches(analysis.fvgAnalysis.direction, direction));
    const fvgConfirmed = Boolean(fvgMatches && analysis.fvgAnalysis?.touched && analysis.fvgAnalysis.fillState !== "invalid");
    const liquidityConfirmed = Boolean(analysis.liquidity.rejectionConfirmed || analysis.liquidity.realBreakoutContinuation || analysis.liquiditySweep);
    const structureConfirmed = direction === "Bullish" ? analysis.structure === "BOS" || analysis.structure === "bullish" : direction === "Bearish" ? analysis.structure === "CHoCH" || analysis.structure === "bearish" : false;
    const trendAligned = direction === "Bullish" ? analysis.trend === "bullish" : direction === "Bearish" ? analysis.trend === "bearish" : false;
    const volatilityOk = this.isVolatilityAcceptable(analysis);
    const spreadOk = this.isSpreadAcceptable(spread, analysis.atr);
    const confirmationCount = [trendAligned, structureConfirmed, fvgConfirmed, liquidityConfirmed, analysis.retestConfirmed, volatilityOk, spreadOk].filter(Boolean).length;
    const confidence = clamp(
      (direction !== "Neutral" ? 15 : 0) +
        (trendAligned ? 16 : 0) +
        (structureConfirmed ? 16 : 0) +
        (fvgConfirmed ? 14 : fvgMatches ? 7 : 0) +
        (liquidityConfirmed ? 12 : 0) +
        (analysis.retestConfirmed ? 10 : 0) +
        (volatilityOk ? 8 : -18) +
        (spreadOk ? 6 : -12) +
        (riskReward >= this.settings.minRiskReward ? 8 : -8),
      100,
    );
    const missingConditions = [
      redNewsNearby ? "News safety" : null,
      direction === "Neutral" ? "Clear BUY or SELL bias" : null,
      trendAligned ? null : "Trend aligned",
      structureConfirmed ? null : "Market structure confirmation",
      fvgConfirmed ? null : "FVG confirmation/retest",
      liquidityConfirmed ? null : "Liquidity confirmation",
      volatilityOk ? null : "Volatility acceptable",
      spreadOk ? null : "Spread acceptable",
      riskReward >= this.settings.minRiskReward ? null : `Risk/reward >= 1:${this.settings.minRiskReward.toFixed(1)}`,
    ].filter(Boolean) as string[];

    if (redNewsNearby || direction === "Neutral" || confidence < 50 || confirmationCount < 3) {
      return {
        confidence,
        missingConditions,
        signal: "WAIT",
        waitReason: `WAIT: ${missingConditions[0] ?? "category setup not confirmed"}`,
      };
    }

    if (confidence >= 75 && confirmationCount >= 5) {
      return {
        confidence,
        missingConditions: [],
        signal: direction === "Bullish" ? "STRONG BUY" : "STRONG SELL",
        waitReason: `${this.settings.name}: strong ${direction.toLowerCase()} confirmation`,
      };
    }

    if (confidence >= this.settings.minConfidence && confirmationCount >= 4) {
      return {
        confidence,
        missingConditions: [],
        signal: direction === "Bullish" ? "BUY" : "SELL",
        waitReason: `${this.settings.name}: educational ${direction.toLowerCase()} setup confirmed`,
      };
    }

    return {
      confidence,
      missingConditions,
      signal: direction === "Bullish" ? "WATCH BUY" : "WATCH SELL",
      waitReason: `${this.settings.name}: setup forming, wait for missing confirmation`,
    };
  }

  protected isVolatilityAcceptable(analysis: TechnicalAnalysis) {
    if (this.settings.volatilityStrictness === "wide") {
      return analysis.volatility !== "calme";
    }

    if (this.settings.volatilityStrictness === "strict") {
      return analysis.volatility === "normale" || analysis.volatility === "volatile";
    }

    return analysis.volatility !== "trop dangereuse";
  }

  protected isSpreadAcceptable(spread: number | null, atr: number) {
    if (spread === null) {
      return true;
    }

    const profileLimit = this.profile.spreadWarning;
    if (profileLimit) {
      return spread <= profileLimit;
    }

    const multiplier = this.settings.volatilityStrictness === "wide" ? 0.45 : this.settings.volatilityStrictness === "strict" ? 0.22 : 0.32;
    return spread <= Math.max(atr * multiplier, 0.00001);
  }
}

export class GoldAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "GoldAnalysisEngine", useGoldOrb: true, minConfidence: 58, minRiskReward: 1.0, volatilityStrictness: "normal" };
  }
}

export class ForexAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "ForexAnalysisEngine", useGoldOrb: false, minConfidence: 62, minRiskReward: 1.2, volatilityStrictness: "strict" };
  }
}

export class CryptoAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "CryptoAnalysisEngine", useGoldOrb: false, minConfidence: 66, minRiskReward: 1.4, volatilityStrictness: "wide" };
  }
}

export class IndicesAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "IndicesAnalysisEngine", useGoldOrb: false, minConfidence: 64, minRiskReward: 1.2, volatilityStrictness: "normal" };
  }
}

export class CommoditiesAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "CommoditiesAnalysisEngine", useGoldOrb: false, minConfidence: 63, minRiskReward: 1.25, volatilityStrictness: "normal" };
  }
}

export class StocksAnalysisEngine extends SymbolAnalysisEngine {
  get settings(): EngineSettings {
    return { name: "StocksAnalysisEngine", useGoldOrb: false, minConfidence: 65, minRiskReward: 1.3, volatilityStrictness: "strict" };
  }
}

export function getAnalysisEngine(profile: SymbolProfile): SymbolAnalysisEngine {
  if (profile.symbol === "XAUUSD") {
    return new GoldAnalysisEngine(profile);
  }

  if (profile.category === "Forex") {
    return new ForexAnalysisEngine(profile);
  }

  if (profile.category === "Crypto") {
    return new CryptoAnalysisEngine(profile);
  }

  if (profile.category === "Indices") {
    return new IndicesAnalysisEngine(profile);
  }

  if (profile.category === "Energies" || profile.category === "Commodities" || profile.symbol === "XAGUSD") {
    return new CommoditiesAnalysisEngine(profile);
  }

  return new StocksAnalysisEngine(profile);
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

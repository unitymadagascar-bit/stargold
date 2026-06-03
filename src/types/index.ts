export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export type Signal = "BUY" | "SELL" | "WAIT" | "HIGH RISK" | "NO TRADE";

export type Direction = "Bullish" | "Bearish" | "Neutral";

export type Trend = "bullish" | "bearish" | "range";

export type StructureState = "bullish" | "bearish" | "range" | "BOS" | "CHoCH";

export type VolatilityState = "calme" | "normale" | "volatile" | "trop dangereuse";

export type EconomicImpact = "red" | "orange" | "yellow";

export type FundamentalBias = "bullish-gold" | "bearish-gold" | "neutral";

export type FundamentalRecommendation = "Trader" | "Attendre" | "Eviter";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTick {
  symbol: "XAUUSD";
  time: number;
  bid?: number;
  ask?: number;
  price: number;
  volume?: number;
}

export type LiveConnectionStatus = "missing-config" | "connecting" | "live" | "reconnecting" | "error" | "closed";

export interface LiveMarketState {
  status: LiveConnectionStatus;
  message: string;
  lastTick: MarketTick | null;
  serverOffsetMinutes: number;
  latencyMs: number | null;
  candleMap: Record<Timeframe, Candle[]>;
}

export interface SupportResistanceLevel {
  price: number;
  type: "support" | "resistance";
  strength: number;
}

export interface TechnicalAnalysis {
  trend: Trend;
  structure: StructureState;
  rsi: number;
  atr: number;
  ema20: number;
  ema50: number;
  ema200: number;
  support: number;
  resistance: number;
  breakout: boolean;
  fakeout: boolean;
  liquiditySweep: boolean;
  retestConfirmed: boolean;
  volatility: VolatilityState;
  orderBlock: number | null;
  fvg: { low: number; high: number } | null;
  displacement: boolean;
}

export interface MacroContext {
  dxyDirection: Direction;
  us10yDirection: Direction;
  fedTone: "hawkish" | "neutral" | "dovish";
  geopoliticalRisk: "low" | "medium" | "high";
  centralBankBuying: "weak" | "stable" | "strong";
}

export interface NewsEvent {
  title: string;
  impact: "medium" | "high";
  minutesAway: number;
}

export interface EconomicNewsEvent {
  id: string;
  name: string;
  currency: string;
  dateTime: string;
  impact: EconomicImpact;
  actual: string;
  forecast: string;
  previous: string;
  source: string;
  notes: string;
}

export interface DxyContext {
  direction: "rising" | "falling" | "range" | "unknown";
  strength: "strong" | "moderate" | "weak";
  value: number | null;
  source: string;
  updatedAt: string | null;
}

export interface FundamentalContext {
  mode: "api" | "manual";
  source: string;
  updatedAt: string | null;
  events: EconomicNewsEvent[];
  nextHighImpactEvent: EconomicNewsEvent | null;
  caution: boolean;
  cautionMessage: string | null;
  usdInterpretation: string;
  goldInterpretation: string;
  newsBias: FundamentalBias;
  dxy: DxyContext;
  riskLevel: "faible" | "modere" | "eleve";
  recommendation: FundamentalRecommendation;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  signal: Signal;
  score: number;
  trend: Trend;
  rsi: number;
  atr: number;
  structure: StructureState;
  support: number;
  resistance: number;
  liquiditySweep: boolean;
  retestConfirmed: boolean;
  volatility: VolatilityState;
  newsNearby: boolean;
  riskReward: number;
  summary: string;
}

export interface ScoringBreakdown {
  technical: number;
  orderFlow: number;
  fundamental: number;
  risk: number;
  total: number;
  priceAction?: number;
  marketStructure?: number;
  dxy?: number;
  news?: number;
  volatilityRisk?: number;
}

export interface TradePlan {
  direction: Direction;
  decision: Signal;
  score: number;
  summary: string;
  entry: number;
  stopLoss: number;
  takeProfits: [number, number, number];
  riskReward: number;
  lotSize: number;
  alerts: string[];
  scoring: ScoringBreakdown;
}

export interface RiskInput {
  capital: number;
  riskPercent: number;
  stopLossDistance: number;
  pipValue: number;
}

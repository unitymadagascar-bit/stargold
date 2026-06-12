export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export type Signal =
  | "STRONG BUY"
  | "BUY"
  | "BUY SCALP READY"
  | "PRE-SIGNAL BUY"
  | "WATCH BUY"
  | "ORB BREAKOUT WATCH"
  | "FVG RETEST WATCH"
  | "WAIT"
  | "PRE-SIGNAL SELL"
  | "WATCH SELL"
  | "SELL SCALP READY"
  | "SELL"
  | "STRONG SELL";

export type AssetCategory = "Metals" | "Forex" | "Crypto" | "Indices" | "Energies" | "Commodities" | "Stocks";

export type SymbolCode = string;

export interface SymbolProfile {
  symbol: SymbolCode;
  label: string;
  category: AssetCategory;
  volatility: "low" | "medium" | "high" | "extreme";
  sessions: string[];
  importantNews: string[];
  strategy: string;
  quoteCurrency?: string;
  spreadWarning?: number;
}

export type SignalMode = "conservative" | "scalping";

export type AnalysisDepth = "quick" | "deep";

export type QuickEntryMode = "safe" | "fast" | "mixed";

export type ScalpingSensitivity = "safe" | "balanced" | "aggressive";

export interface CounterTrendAnalysis {
  active: boolean;
  allowed: boolean;
  enabled: boolean;
  score: number;
  threshold: number;
  status: "trend-following" | "blocked" | "premium-confirmed";
  warning: string | null;
  reasons: string[];
  missing: string[];
}

export type OrbDuration = 5 | 15 | 30;

export type MovingAverageType = "EMA" | "SMA";

export type OrbSession = "London" | "New York";

export type OrbStatus = "WAIT" | "FORMING" | "ORB BREAKOUT WATCH" | "FVG RETEST WATCH" | "ORB BUY WATCH" | "ORB SELL WATCH" | "ORB BUY CONFIRMED" | "ORB SELL CONFIRMED" | "ORB FAILED";

export type FvgDirection = "bullish" | "bearish";

export type FvgFillState = "fresh" | "partial" | "full" | "invalid";

export type Direction = "Bullish" | "Bearish" | "Neutral";

export type MarketPhase =
  | "middle-zone"
  | "near-buy-zone"
  | "near-sell-zone"
  | "inside-buy-zone"
  | "inside-sell-zone"
  | "breakout"
  | "retest"
  | "consolidation-range"
  | "strong-trend"
  | "high-risk";

export type EntryState = "zone-detected" | "setup-forming" | "confirmed-entry";

export type SignalTimingLevel = "none" | "pre-signal" | "momentum-breakout" | "early-continuation" | "confirmed" | "late";

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
  symbol: SymbolCode;
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
  source: string | null;
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

export type OrderBlockDirection = "bullish" | "bearish";

export type OrderBlockStrength = "strong" | "medium" | "weak" | "ignored";

export interface OrderBlockScoreBreakdown {
  bos: number;
  displacement: number;
  trendAlignment: number;
  liquiditySweep: number;
  freshness: number;
  fvg: number;
  riskReward: number;
  volatility: number;
  total: number;
}

export interface OrderBlockZone {
  direction: OrderBlockDirection;
  strength: OrderBlockStrength;
  score: number;
  proximal: number;
  distal: number;
  low: number;
  high: number;
  originTime: number;
  breakTime: number;
  touched: boolean;
  retestCount: number;
  fresh: boolean;
  bosConfirmed: boolean;
  displacementConfirmed: boolean;
  liquiditySweep: boolean;
  fvg: { low: number; high: number } | null;
  riskReward: number;
  atrQuality: "good" | "acceptable" | "poor";
  requiresExtraConfirmation: boolean;
  reasons: string[];
  scoreBreakdown: OrderBlockScoreBreakdown;
}

export type LiquidityType = "buy-side liquidity" | "sell-side liquidity" | "mixed" | "none";

export type LiquidityDirection = "BUY" | "SELL" | "Attendre";

export interface LiquidityZone {
  price: number;
  type: "buy-side liquidity" | "sell-side liquidity";
  strength: number;
  equalLevel: boolean;
}

export interface LiquidityAnalysis {
  zone: LiquidityZone | null;
  type: LiquidityType;
  buySideZones: LiquidityZone[];
  sellSideZones: LiquidityZone[];
  equalHighs: LiquidityZone[];
  equalLows: LiquidityZone[];
  sweepDetected: boolean;
  stopHunt: boolean;
  falseBreakout: boolean;
  rejectionConfirmed: boolean;
  reversalAfterLiquidityGrab: boolean;
  realBreakoutContinuation: boolean;
  consolidationBeforeImpulse: boolean;
  longWick: boolean;
  activeSession: "London" | "New York" | "Overlap" | "Off session";
  probableDirection: LiquidityDirection;
  confidence: number;
  riskLevel: "faible" | "modere" | "eleve";
  cautionMessage: string;
  reasons: string[];
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
  orderBlock: OrderBlockZone | null;
  liquidity: LiquidityAnalysis;
  fvg: { low: number; high: number } | null;
  fvgAnalysis: FvgAnalysis | null;
  orb: OrbAnalysis | null;
  trendFilter: TrendFilterAnalysis | null;
  displacement: boolean;
}

export interface FvgAnalysis {
  direction: FvgDirection;
  low: number;
  high: number;
  originTime: number;
  timeframe: Timeframe;
  fillPercent: number;
  fillState: FvgFillState;
  fresh: boolean;
  touched: boolean;
  rejectionConfirmed: boolean;
  score: number;
  missingConfirmation: string;
}

export interface OrbAnalysis {
  session: OrbSession;
  duration: OrbDuration;
  status: OrbStatus;
  direction: Direction;
  high: number;
  low: number;
  startTime: number;
  endTime: number;
  breakoutTime: number | null;
  breakoutConfirmed: boolean;
  retestConfirmed: boolean;
  fakeBreakout: boolean;
  momentumAligned: boolean;
  atrOk: boolean;
  spreadOk: boolean;
  newsSafe: boolean;
  entryZone: { low: number; high: number };
  stopLoss: number;
  takeProfits: [number, number];
  invalidation: string;
  confidence: number;
  riskLevel: "faible" | "modere" | "eleve";
  missingConfirmation: string;
}

export interface TrendFilterAnalysis {
  type: MovingAverageType;
  period: number;
  value: number;
  bias: Direction;
  strongAgainst: boolean;
  distancePercent: number;
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
  signalMode: SignalMode;
  analysisDepth: AnalysisDepth;
  scalpingSensitivity: ScalpingSensitivity;
  waitReason: string;
  missingConditions: string[];
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
  orderBlock: OrderBlockZone | null;
  liquidity: LiquidityAnalysis | null;
  fvg: FvgAnalysis | null;
  orb: OrbAnalysis | null;
  trendFilter: TrendFilterAnalysis | null;
  marketScenario: MarketScenario;
  quickAnalysis: QuickAnalysisResult | null;
  counterTrend: CounterTrendAnalysis;
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
  liquidity?: number;
  dxy?: number;
  news?: number;
  volatilityRisk?: number;
}

export interface TradePlan {
  direction: Direction;
  decision: Signal;
  analysisDepth: AnalysisDepth;
  directionalBias: "Buy" | "Sell" | "Neutral";
  entryConfirmation: "Confirmed" | "Not confirmed";
  entryRiskLevel: "Low" | "Medium" | "High";
  signalReason: string;
  waitFor: string;
  signalMode: SignalMode;
  scalpingSensitivity: ScalpingSensitivity;
  waitReason: string;
  missingConditions: string[];
  score: number;
  summary: string;
  entry: number;
  stopLoss: number;
  takeProfits: [number, number, number];
  riskReward: number;
  lotSize: number;
  alerts: string[];
  scoring: ScoringBreakdown;
  orderBlock: OrderBlockZone | null;
  liquidity: LiquidityAnalysis | null;
  fvg: FvgAnalysis | null;
  orb: OrbAnalysis | null;
  trendFilter: TrendFilterAnalysis | null;
  marketScenario: MarketScenario;
  quickAnalysis: QuickAnalysisResult | null;
  counterTrend: CounterTrendAnalysis;
  accountRisk: AccountRiskSummary;
}

export interface QuickAnalysisResult {
  signal: "BUY" | "SELL" | "WAIT";
  h1Trend: "Haussiere" | "Baissiere" | "Neutre";
  h1Direction: Direction;
  entryTimeframe: "M15" | "M5";
  entryMode: QuickEntryMode;
  orderBlockLabel: string;
  orderBlockZone: MarketScenarioZone;
  entryZone: MarketScenarioZone;
  idealEntry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  status: "Entree valide" | "Attendre confirmation" | "Pas de trade";
  reasons: string[];
  missing: string[];
  confirmations: {
    bosChoch: boolean;
    crt: boolean;
    fibonacci: boolean;
    liquidity: boolean;
    orderBlockReaction: boolean;
    priceAction: boolean;
    rsi: boolean;
    trendline: boolean;
  };
}

export interface MarketScenarioZone {
  low: number;
  high: number;
  label: string;
}

export interface MarketScenarioLevel {
  price: number;
  label: string;
  tone: "buy" | "sell" | "wait" | "neutral";
}

export interface MarketScenarioArrow {
  direction: "buy" | "sell" | "wait";
  label: string;
}

export interface MarketScenario {
  phase: MarketPhase;
  entryState: EntryState;
  signalTiming: SignalTimingLevel;
  primaryBias: "Buy" | "Sell" | "Neutral";
  pricePosition: string;
  quickScenario: string;
  advancedScenario: string;
  alternativeScenario: string;
  requiredConfirmation: string;
  validatedConfirmations: string[];
  missingConfirmations: string[];
  detectedRisks: string[];
  shortExplanation: string;
  detailedExplanation: string;
  confidence: number;
  movementProgress: number;
  lateReason: string | null;
  buyZone: MarketScenarioZone;
  sellZone: MarketScenarioZone;
  waitZone: MarketScenarioZone;
  keyLevels: MarketScenarioLevel[];
  arrow: MarketScenarioArrow;
  invalidationLevel: number;
}

export interface RiskInput {
  capital: number;
  riskPercent: number;
  stopLossDistance: number;
  pipValue: number;
}

export interface RiskSettings {
  capital: number;
  maxDailyLossPercent: number;
  minLot: number;
  pipValue: number;
  riskPercent: number;
}

export interface AccountRiskSummary {
  capital: number;
  maxDailyLoss: number;
  maxLoss: number;
  minLot: number;
  pipValue: number;
  positionAllowed: boolean;
  riskPercent: number;
  riskWarning: string | null;
}

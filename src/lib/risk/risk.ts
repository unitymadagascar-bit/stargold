import type { AccountRiskSummary, RiskInput, RiskSettings } from "@/types";

export const defaultRiskSettings: RiskSettings = {
  capital: 10000,
  maxDailyLossPercent: 3,
  minLot: 0.01,
  pipValue: 10,
  riskPercent: 1,
};

export function calculateRiskReward(entry: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);

  if (risk === 0) {
    return 0;
  }

  return reward / risk;
}

export function calculateLotSize(input: RiskInput): number {
  const moneyAtRisk = input.capital * (input.riskPercent / 100);
  const stopValue = input.stopLossDistance * input.pipValue;

  if (stopValue <= 0) {
    return 0;
  }

  return Number((moneyAtRisk / stopValue).toFixed(2));
}

export function calculateMaxLoss(capital: number, riskPercent: number): number {
  return Number((capital * (riskPercent / 100)).toFixed(2));
}

export function normalizeRiskSettings(settings: Partial<RiskSettings> | null | undefined): RiskSettings {
  return {
    capital: clampNumber(settings?.capital, 1, 10_000_000, defaultRiskSettings.capital),
    maxDailyLossPercent: clampNumber(settings?.maxDailyLossPercent, 0.1, 20, defaultRiskSettings.maxDailyLossPercent),
    minLot: clampNumber(settings?.minLot, 0.001, 100, defaultRiskSettings.minLot),
    pipValue: clampNumber(settings?.pipValue, 0.00001, 1_000_000, defaultRiskSettings.pipValue),
    riskPercent: clampNumber(settings?.riskPercent, 0.01, 20, defaultRiskSettings.riskPercent),
  };
}

export function buildAccountRiskSummary(settings: RiskSettings, stopLossDistance: number): AccountRiskSummary {
  const normalized = normalizeRiskSettings(settings);
  const lotSize = calculateLotSize({
    capital: normalized.capital,
    pipValue: normalized.pipValue,
    riskPercent: normalized.riskPercent,
    stopLossDistance,
  });
  const maxLoss = calculateMaxLoss(normalized.capital, normalized.riskPercent);
  const maxDailyLoss = calculateMaxLoss(normalized.capital, normalized.maxDailyLossPercent);
  const riskWarning = getRiskWarning({ lotSize, maxLoss, settings: normalized, stopLossDistance });

  return {
    capital: normalized.capital,
    maxDailyLoss,
    maxLoss,
    minLot: normalized.minLot,
    pipValue: normalized.pipValue,
    positionAllowed: !riskWarning,
    riskPercent: normalized.riskPercent,
    riskWarning,
  };
}

function getRiskWarning({
  lotSize,
  maxLoss,
  settings,
  stopLossDistance,
}: {
  lotSize: number;
  maxLoss: number;
  settings: RiskSettings;
  stopLossDistance: number;
}) {
  if (settings.capital <= 0 || settings.riskPercent <= 0 || settings.pipValue <= 0) {
    return "Capital, risque ou valeur pip invalide.";
  }

  if (stopLossDistance <= 0) {
    return "Stop loss invalide: impossible de calculer une position.";
  }

  if (lotSize > 0 && lotSize < settings.minLot) {
    return `Capital trop petit pour respecter ${settings.riskPercent}% de risque avec le lot minimum ${settings.minLot}.`;
  }

  if (settings.riskPercent > settings.maxDailyLossPercent) {
    return "Le risque par trade depasse la perte max journaliere configuree.";
  }

  if (settings.riskPercent > 3) {
    return "Risque par trade eleve: reduis le risque ou augmente le capital avant execution.";
  }

  if (maxLoss > settings.capital * 0.05) {
    return "Perte potentielle superieure a 5% du capital.";
  }

  return null;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

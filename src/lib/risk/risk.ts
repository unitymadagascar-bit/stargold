import type { RiskInput } from "@/types";

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

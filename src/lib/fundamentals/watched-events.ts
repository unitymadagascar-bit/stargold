export const watchedUsdEventKeywords = [
  "fomc",
  "interest rate",
  "fed chair powell",
  "powell",
  "cpi",
  "inflation",
  "nfp",
  "non-farm payroll",
  "nonfarm payroll",
  "unemployment rate",
  "average hourly earnings",
  "ppi",
  "retail sales",
  "gdp",
  "ism manufacturing",
  "ism services",
  "jobless claims",
];

export function isWatchedUsdEvent(name: string) {
  const lowerName = name.toLowerCase();
  return watchedUsdEventKeywords.some((keyword) => lowerName.includes(keyword));
}

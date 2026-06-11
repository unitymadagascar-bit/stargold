import { StrategyChartPage } from "@/components/strategy-chart/strategy-chart-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const params = await searchParams;
  return <StrategyChartPage initialSymbol={params.symbol ?? "XAUUSD"} />;
}

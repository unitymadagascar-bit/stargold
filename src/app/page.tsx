import { MainDashboard } from "@/components/dashboard/main-dashboard";
import { buildTimeframeAnalyses, buildTradePlan, candleMap, macroContext, newsEvents } from "@/lib/mock-data";

export default function Home() {
  const timeframeAnalyses = buildTimeframeAnalyses();
  const plan = buildTradePlan();

  return <MainDashboard candleMap={candleMap} macro={macroContext} news={newsEvents} plan={plan} timeframeAnalyses={timeframeAnalyses} />;
}

import AdminCosting from "./AdminCosting";
import { visualCostingData, visualCostingHistory } from "./visualCostingFixture";

export default function VisualCostingHarness() {
  return <AdminCosting initialCosting={visualCostingData} initialHistory={visualCostingHistory} />;
}

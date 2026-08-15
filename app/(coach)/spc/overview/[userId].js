import { useLocalSearchParams } from "expo-router";
import { CoachSpcOverview } from "../../../../components/coach/CoachSpcOverview";

// The SPC overview as its own pushed route — used from the web build, where
// the client page is still the block grid. On native the same component is
// embedded straight into the client page, with no button to press.
export default function CoachSpcOverviewRoute() {
  const { userId } = useLocalSearchParams();
  return <CoachSpcOverview userId={userId} showBack />;
}

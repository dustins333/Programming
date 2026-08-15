import { useLocalSearchParams } from "expo-router";
import { CoachBlockOverview } from "../../../components/coach/CoachBlockOverview";

// The overview as its own pushed route — used from the web build, where the
// Group Programs page is still the build grid and this is opened from its
// Preview button. On native the same component IS the Group Programs tab
// (app/(coach)/blocks/index.js), with no button to press.
export default function CoachBlockOverviewRoute() {
  const { program } = useLocalSearchParams();
  return <CoachBlockOverview initialProgramId={program ?? null} showBack />;
}

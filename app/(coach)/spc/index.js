import { SpcRosterMobile } from "../../../components/coach/SpcRosterMobile";

// Native SPC roster. The screen itself is SpcRosterMobile, shared with
// index.web.js, which renders it below the mobile breakpoint — see that file
// for why it can't just import this one.
export default function SpcDashboard() {
  return <SpcRosterMobile />;
}

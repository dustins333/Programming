// Shared across all 4 member nutrition screens so they can never drift out
// of sync with each other — matches the standalone Nutrition Tracker app's
// actual tab names/order (app/home/HomeTabs.js), not Kova's earlier
// placeholder naming (Today/Check-in/History).
export const NUTRITION_TABS = [
  { key: "today", label: "Today", href: "/(member)/nutrition" },
  { key: "weekly", label: "Weekly", href: "/(member)/nutrition/weekly" },
  { key: "checkin", label: "Check-In", href: "/(member)/nutrition/checkin" },
  { key: "photos", label: "Photos", href: "/(member)/nutrition/photos" },
];

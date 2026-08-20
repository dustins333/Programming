// Who may upload and commit a CCrew month.
//
// Mirrors core.can_manage_ccrew() in migration 0070 exactly — RLS is the
// real enforcement, this just decides what to show. Keep the two in step:
// if this loosens and the policy doesn't, the button appears and the write
// fails; if the policy loosens and this doesn't, the feature is invisible
// to someone who has it.
//
// Rides on can_log_ops_hours (0036), which already means "runs gym
// operations, not just coaching" and is settable per coach in
// Settings > Team. Admin always passes.
//
// Viewing is separate and wider — every coach can see CCrew.
export function canManageCcrew(profile) {
  if (!profile) return false;
  return profile.role === "admin" || (profile.role === "coach" && Boolean(profile.can_log_ops_hours));
}

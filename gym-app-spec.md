# Kova Strength — Programming Platform Build Spec

## 1. What this replaces / does
- **TrueCoach** → client-facing app where girls log in, see their workout, see history per lift, log new results.
- **Google Sheets (SPC Template, Programming Status Sheet, Programming Skeleton)** → digital program builder + client tracking + collaborative programming.
- **Paper/clipboard SPC sessions** → eventually, Kiosk Mode (Phase 6). Until then, a **print/export view** matching your current SPC print layout, built in from day one.
- **Manual coach reminders** → Phase 7: CRM (Gym Lead Machine / GoHighLevel) integration for texting coaches and syncing client tags.

Scale: ~150 Flagship, ~60 SPC (some clients are Hybrid — enrolled in both).

## 2. Confirmed decisions
- **Login:** One shared login type for coaches — all coaches see all clients (no siloing), each client has an assigned coach for accountability/notifications.
- **Migration:** Starting fresh going forward. No auto-import from TrueCoach or the Google Sheets.
- **Exercise library:** Text-based (name + cues), categorized by muscle group. Better With Age pulls from the same shared library as Flagship/SPC (no separate library).
- **Members are adults** — self-login, no parent/guardian layer.
- **PWA:** Installable/add-to-homescreen on phones.
- **Reporting:** Coach workload (clients per coach, blocks written) is nice to have. Compliance/"falling behind" tracking is not a priority.
- **Settings page:** Admin-configurable values from day one — alert lead time (default 3 days), default block lengths, etc.
- **SPC block auto-draft:** When a block is ending, the alert fires AND a **blank draft** is created so it's visibly flagged as due — plus a **"Copy Last Block"** button so the coach can populate it in one click if they want to.
- **Movement-pattern balance tool:** Live tally counter (Squat / Lunge / Hinge / Core, Row / Horizontal Push / Vertical Pull / Vertical Push) shown while building a Flagship or Better With Age block — mirrors the tracker in your current Programming Skeleton sheet.
- **Coach collaboration:** In-app comment threads on programs (mirrors the Abbi Notes / Terra Notes back-and-forth in your Skeleton sheet) — coaches can leave feedback/discussion directly on a block, not just in Slack/text.
- **SPC status tracking:** Keeping your existing 5 statuses — Printed & Ready ✅ / Needs Printed 🖨️ / New Program ASAP 🚨 / Coming Up Next Week 🔔 / Paused ⏸️.

## 3. Program types
| Type | Block length | Structure |
|---|---|---|
| **Flagship** | 4 weeks | Group programming, 3 sessions/week (Mon/Tue = Session 1, Wed/Thu = Session 2, Fri/Sat = Session 3). Shared block calendar. |
| **Better With Age** | 6 weeks | Same structure as Flagship (group sessions, same exercise library), longer block, older client base. |
| **SPC** | 4 weeks default, adjustable | Individualized per client, staggered — each client's block runs on its own timeline. |

**"Hybrid" isn't a 4th type** — it's a client with both a group program AND an SPC track assigned simultaneously. Handled by giving a client independent group-program and SPC assignments; their dashboard shows both.

### Within a group block (Flagship / Better With Age)
- Structurally consistent across the block, tweaked week to week (sets, tempo, etc. — mirrors the Mesocycle → Session 1/2/3 → Warm-up + Movement/Reps layout in your Skeleton sheet).
- Coach can edit a published week anytime, even after clients have seen it. No locking.
- Each session's warm-up is its own short list (5-6 movements), separate from the main lifts — matches your current format.

### Within an SPC block
- Fully individualized, written by the assigned coach.
- Reassignable to a different coach anytime via simple select — no CRM sync required for this in v1.

## 4. SPC print/export (interim, built from day one)
Matches your current **SPC Template** sheet layout exactly, so the transition off paper is invisible to whoever's printing:
- **Warm-up section:** numbered list (1-6), each with Sets / Reps / Notes.
- **Main Session section:** each exercise row shows Sets / Reps / Rest, with **Week 1 / Week 2 / Week 3 / Week 4** columns — each week column includes a coach initials + date field for tracking when it was last touched.
- One-click "Export/Print" from any SPC block generates this layout, clipboard-ready, until Kiosk Mode fully replaces paper.

## 5. SPC tracking dashboard
Mirrors your **Programming Status Sheet**:
- Roster grouped by assigned coach (matches the coach-grouped blocks in your current sheet — e.g. Abbi's clients, Ash's clients, etc.).
- Per client: name, #sessions/week, status (one of the 5 above), Notes/Goals/Feedback (free text — goals, injury notes, preferences, hold/pause reasons, etc., exactly like your current notes column).
- Filterable by coach, status, or "due soon."
- Block-ending workflow: alert fires (default 3 days out, configurable) → blank draft auto-created and flagged → "Copy Last Block" available.

## 6. Tech stack
- **Framework:** Next.js (React), built as a PWA — one codebase for client portal, coach dashboard, admin views, and kiosk mode.
- **Database:** Postgres (Supabase or Neon).
- **Auth:** Email/password (Supabase Auth or NextAuth), role-gated (admin / coach / member).
- **Hosting:** Vercel + Supabase/Neon.
- **Kiosk mode:** Same web app, full-screen browser on a touchscreen PC — no native app needed.

## 7. Core data model (high level)
- `users` — id, name, email, role (admin / coach / member), password hash, phone (future CRM/texting)
- `exercises` — id, name, muscle_group, cues, optional video_url
- `group_programs` — id, name (Flagship / Better With Age), block_length_weeks, sessions_per_week
- `group_blocks` — id, group_program_id, block_start_date, block_end_date
- `group_workouts` — id, block_id, session_number, week_number, warmup_items, exercises (sets/reps/tempo/notes), pattern_tally (derived), status (draft/published)
- `program_comments` — id, group_block_id or spc_block_id, coach_id, comment_text, created_at (the coach-to-coach thread)
- `spc_clients` — user_id, assigned_coach_id, sessions_per_week, status, notes_goals_feedback
- `spc_blocks` — id, spc_client_id, coach_id, block_start_date, block_length_weeks, block_end_date, status (draft/published/printed/due-soon/overdue/paused)
- `spc_workouts` — id, spc_block_id, warmup_items, exercises (sets/reps/rest/notes per week, week 1-4 with coach initials + date)
- `client_program_assignments` — user_id, group_program_id (nullable), spc_client_id (nullable) — makes Hybrid "just work"
- `logs` — user_id, exercise_id, date_performed, actual sets/reps/weight/notes, source (flagship/bwa/spc)
- `settings` — key/value table for admin-configurable values

`logs` is keyed by `exercise_id` directly so "what did she do last time on lateral raises" works regardless of which program it came from.

## 8. Features by module

### A. Workout Builder (coach tool)
- Split-screen: client's program on one side, exercise library on the other, categorized by muscle group (click category → see exercises → click to insert).
- New exercise defaults to 3x10, pre-filled with the client's most recent log for that exact exercise if one exists.
- Live movement-pattern tally (Squat/Lunge/Hinge/Core, Row/H Push/V Pull/V Push) while building a Flagship/BWA block.
- In-app coach comment thread on any block.
- Drafts are first-class — save mid-edit, publish when ready.
- Works for Flagship, Better With Age, and SPC blocks from the same tool.

### B. Group Programming (Flagship / Better With Age)
- Coach builds a block (4 or 6 weeks), 3 sessions/week, each with its own warm-up + main lifts.
- Editable anytime, even post-publish.
- Members auto-see the right session based on which day they check the app.

### C. SPC — Program Builder + Tracking Dashboard + Print Export
- As described in Sections 4 & 5.

### D. Client Portal (all members, PWA)
- Login → see current week's workout(s) — Flagship, Better With Age, and/or SPC, whatever's assigned.
- History per exercise, regardless of source program.
- Log results.

### E. SPC Live Session Kiosk (Phase 6)
- Full-screen touchscreen, 4 quadrants, dropdown per quadrant to select the client in that slot.
- Shows that client's workout for the day + last-time history per lift.
- Coach taps in live results, writes straight to `logs`.
- Fully replaces the print/export workflow once live.

### F. Admin
- Settings page: alert lead time, default block lengths per program type, other tunables.
- Coach assignment for SPC clients.
- Basic reporting: clients per coach, blocks written per coach.

## 9. Future phase — CRM integration (Gym Lead Machine / GoHighLevel) — Phase 7
- **Texting:** notify assigned coach when a block is due, via GHL instead of just in-app.
- **Tag sync:** read contact tags from GHL to auto-populate `client_program_assignments`, instead of maintaining membership in two places.
- Data model already shaped to support this (`client_program_assignments`, `users.phone`) without rework.

## 10. Branding — pulled from kovastrength.com
- **Brand:** Kova Strength — women-only strength gym, Idaho Falls, ID. Voice: "real results, real women," structured programming, hands-on coaching, accountability, community.
- **Colors (as provided):**
  - `#AD816D` — warm terracotta/clay (primary accent)
  - `#A46A57` — deeper rust/brown (secondary, likely for CTAs/emphasis)
  - `#BEAC95` — muted sand/taupe (background/neutral tone)
- **Feel:** warm, earthy, grounded, feminine-but-strong — not clinical or high-contrast tech. Soft neutrals over bright whites, warm accents over cool blues.
- **Font:** Not pulled yet. My web tool only extracts readable page content, not raw HTML/CSS, and I have no network access in this environment to `curl` the theme files directly. **Claude Code can do this in one step** — `curl` the site or grep the WordPress theme's CSS for `font-family` — so this should be the very first thing done when the build kicks off, before any UI is styled. In the meantime, a placeholder pairing in the same spirit (warm humanist sans for headings, simple sans for body) is fine to build against.
- Logo image exists on the site but didn't render through fetch — grab the actual logo file from the WordPress media library when building starts.

## 11. Build order
1. **Foundation:** auth, roles, database schema, settings page, brand theme (colors/fonts).
2. **Workout Builder + Exercise Library:** split-screen builder, muscle-group categories, draft support, movement-pattern tally, coach comment threads.
3. **Group Programming:** Flagship + Better With Age block/session structure.
4. **Client Portal (PWA):** login, view workouts, log history — the core TrueCoach replacement.
5. **SPC Program Builder + Tracking Dashboard + Print Export:** individualized blocks, staggered due dates, alert + auto-draft workflow, print layout matching current template.
6. **Kiosk Mode:** 4-quadrant touchscreen live session hub.
7. **CRM Integration:** GoHighLevel texting + tag sync.

## 12. Still open
- Exact font — first task for Claude Code at build start: pull it directly from the live site/theme CSS.
- Nutrition coaching is out of scope — already built separately with Claude Code.

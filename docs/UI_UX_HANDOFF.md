# UI/UX Design Handoff — Career Intelligence Workshop MVP

> **For the design agent:** This document describes every user-facing screen, component, and interaction in the app. No code reading required — you should be able to sketch every screen from these descriptions alone. File paths are provided in parentheses for developer cross-reference.

---

## 1. App Overview

### What It Does
A facilitated career workshop tool used during structured peer-interview sessions. Students pair up in virtual "rooms," take turns interviewing each other about their experiences, and receive AI-generated capability profiles at the end. A facilitator monitors all rooms in real time from a separate dashboard, can send nudges to struggling pairs, and reviews analytics after the session ends.

### Who Uses It
- **Students** — workshop participants who join a session, enter interview rooms, and complete multiple rounds of peer interviewing
- **Facilitators** — instructors or coaches who create sessions, monitor live room activity, nudge participants, and review post-session analytics

### Core User Journey
**Students:** Enter session code + name → pick a room → wait for partner → complete interview rounds (interviewer notes → AI follow-ups → AI profile → switch roles) → view final capability profile → download PDF

**Facilitators:** Log in → create session → share join link → monitor live rooms (color-coded status) → send nudges → end session → view analytics

### Framework & Stack
- **Frontend framework:** SvelteKit v2 with Svelte 5 (uses runes: `$state`, `$derived`, `$effect`)
- **Routing:** SvelteKit file-based routing
- **Backend:** Netlify Functions (serverless), Netlify Blobs (key-value storage), Anthropic Claude API
- **Deployment:** Netlify

### Styling Approach
**Hand-crafted CSS only** — no Tailwind, no component library, no CSS modules. All styles live in a single monolithic file (`styles.css`, 1851 lines) using CSS custom properties (variables) for theming. No external UI kit.

### Routing Structure
| Route | Maps to | Who uses it |
|---|---|---|
| `/` | Redirects immediately to `/interview` | — |
| `/interview` | Student interview flow (multi-screen state machine) | Students |
| `/dashboard` | Facilitator dashboard (multi-screen state machine) | Facilitators |

Both pages are single-route "apps" — they internally render different screens via a state variable, not by navigating to new URLs. Screen transitions use Svelte's fly/fade transitions.

---

## 2. Page-by-Page Inventory

---

### Redirect — `/`
(`src/routes/+page.svelte`)

Instantly redirects to `/interview`. Users see "Redirecting..." for a fraction of a second before the browser navigates. No meaningful UI here.

---

### Student Interview Flow — `/interview`
(`src/routes/interview/+page.svelte` + `src/lib/components/interview/`)

This single route hosts 5 distinct screens controlled by a `screen` state variable. Transitions between screens use a `fly` (y+6px, 300ms) enter and `fade` (150ms) exit animation.

#### Persistent Shell (visible across all interview screens)

**Header** (always visible at top):
- `h1`: "Career Intelligence Workshop" — large, centered
- `p`: "Peer interview — discover capabilities you didn't know you had." — muted subtitle, centered
- Conditional "Leave Session" button (`.ws-leave-btn`) — visible only when on `waiting`, `interview`, or `complete` screens. Small secondary-style button that resets all state and returns user to the entry screen.

**Bottom Navigation** (mobile only, ≤600px, hidden on `entry` and `rooms` screens):
A fixed bottom tab bar with three items:
- `⌂ Home`
- `✎ Interview`
- `★ Profile`
The active item is highlighted in accent color with an accent-light background. Hidden entirely on desktop. Sits above device safe-area insets (iPhone notch support).

**Dark Mode Toggle** (always visible, all screens):
A 44×44px circular button fixed at bottom-right (above bottom nav on mobile). Shows moon emoji in light mode, sun emoji in dark mode.

---

#### Screen 1: Entry — `entry`
(`src/lib/components/interview/EntryScreen.svelte`)

**Purpose:** Student identifies themselves and enters the session code to begin.

**Layout:** Single centered card (`max-width: 680px`) with a header above it. Single-column form.

**Components:**
- Card heading: `h2` "Join a Workshop"
- Subtext: "Enter the session code from your facilitator and your name."
- **Session Code input** — text field, `maxlength=10`. When the page was accessed via a shared link (e.g., `?code=ABC123`), the field is pre-filled, dimmed, and locked (cursor `not-allowed`, disabled state, slightly reduced opacity). The visual treatment signals "this was set for you."
- **Your Name input** — text field with `autocomplete="name"` for mobile autofill
- **Error message** (conditional) — red text shown beneath inputs when validation fails (e.g., empty fields, code not found)
- **"Find Rooms" / "Loading..." button** — primary accent button, full-width, shows "Loading..." with disabled state while fetching. Disabled until both fields are filled.

**User Flows:**
1. Type session code + name → click "Find Rooms" → POST to `workshop-rooms` → if valid, advances to Rooms screen
2. If arriving via shared link, name input is already focused — type name → click "Find Rooms"
3. If API returns error → inline error message appears beneath form

**States:**
- Default (empty form)
- Pre-filled via URL param (code locked)
- Loading (button disabled, text "Loading...")
- Error (red error message visible)

**Data:** No data pre-loaded. Sends session code + student name to API on submit.

---

#### Screen 2: Room Picker — `rooms`
(`src/lib/components/interview/RoomPicker.svelte`)

**Purpose:** Student selects which room to join from the available options.

**Layout:** Centered card with a heading, then a grid of room tiles below.

**Components:**
- Card heading: `h2` "Choose a Room"
- Subtext: "Select an available room to join."
- **Room tile grid** (`.ws-rooms-picker`) — responsive grid of tiles, each representing one room in the session. Each tile shows:
  - Room number (e.g., "Room 3")
  - Occupancy status: "Empty", "1/2", or "Full"
  - Student names if present
  - **Full rooms:** rendered at 50% opacity with `not-allowed` cursor — visually disabled
  - **User's current room** (if rejoining): green border highlight + a small badge that reads "You are here — click to rejoin"
- **"Join a Different Session" button** — secondary outlined button, returns to entry screen

**User Flows:**
1. Click an available room tile → POST to `workshop-join` → advances to Waiting screen
2. Click "You are here" badge on current room → POST to `workshop-join` (rejoin) → advances to Waiting screen
3. Click "Join a Different Session" → returns to Entry screen

**States:**
- Available room (clickable, full opacity)
- Full room (dimmed, not-allowed cursor, non-interactive)
- User's current room (green border, rejoin badge)

**Data:** Room list fetched from `workshop-rooms` (triggered on Entry form submit). Each tile reflects live occupancy data.

---

#### Screen 3: Waiting — `waiting`
(`src/lib/components/interview/WaitingScreen.svelte`)

**Purpose:** Student waits for their partner to join the room before the interview begins.

**Layout:** Centered card, vertically centered content.

**Components:**
- **WaitingDots** — 3 animated pulsing dots (staggered 0s / 0.2s / 0.4s delay). Accent color. Visible while waiting.
- **Status text** — "Waiting for your partner to join..." while solo; changes to "Both partners are here!" when 2 students are present
- **Partner name pills** — when 2 students are present, both names appear as small pill-shaped badges, styled in accent-light blue. They briefly appear before auto-advancing.
- **"Change Room" button** — secondary button, returns to Room Picker

**User Flows:**
1. Student arrives → page polls `workshop-room` every 3s checking for 2 students
2. Second student joins → status updates, name pills appear → auto-advances to Interview screen
3. "Change Room" → POST to `workshop-leave` → returns to Room Picker

**States:**
- Waiting (dots animating, solo message)
- Partner found (dots still, "Both partners are here!" + name pills, auto-advance imminent)

**Data:** Polls `workshop-room` every 3 seconds. Sends heartbeat every 15 seconds via `workshop-heartbeat`.

---

#### Screen 4: Interview — `interview`
(`src/lib/components/interview/InterviewScreen.svelte`)

**Purpose:** The core interview experience. Students take turns as interviewer and storyteller across multiple rounds.

**Layout:** Single-column, max 680px wide. Content stacks vertically: round header → prompt card → role badge → role-specific content → change room link.

**Always-visible elements:**

- **Round header** (`.ws-round-header`): Left side shows "Question X of Y · Turn Z of 2" as small muted text. Right side shows a "Room {id}" pill badge in accent color.
- **Prompt card** (`.ws-prompt-card`): A card with a thick left border in accent blue. Contains the current question prompt text in large body text. This is what the storyteller should answer.
- **Role badge**: A small pill that reads either "You are the interviewer" (blue/accent styling) or "You are the storyteller" (green styling). Critical orientation element.

**Interviewer path — Phase 1: Notes**

- Heading: none (implied by role badge)
- **Notes textarea**: Large textarea labeled "Capture what your partner shares." Autosaves to server with 1.5s debounce. Shows "Auto-saved ✓" indicator for 2s after each save.
- **Character counter**: Shows remaining characters needed to reach 80-char minimum. Red text while below threshold (e.g., "62 more characters to unlock submit"). Neutral/muted once threshold met.
- **"Submit Notes" button**: Primary accent button. Disabled (greyed) until ≥80 characters entered. On click → POST to `workshop-submit` → advances to follow-up phase.

**Interviewer path — Phase 2: Follow-up**

- Section heading: "Follow-up questions to dig deeper" in accent color
- **AI-generated question cards**: 2–3 question cards that fade in with staggered animation (100ms base + 150ms × card index delay). Each card has a question text.
- **"Generate More Questions" button**: Secondary button. Calls `workshop-followup` again for fresh questions. Replaces current cards.
- **Follow-up notes textarea**: Identical to notes textarea — same autosave, same 80-char minimum requirement, same counter.
- **"Submit Follow-up Notes" button**: Same behavior as submit notes, advances to profile phase.

**Interviewer path — Phase 3: Profile**

- **"End Round & Generate Profile" button**: Primary button. On click → `WaitingDots` appear while `workshop-profile` is called (may take several seconds). Button is replaced by loading state.
- **Profile card** (appears after generation, fade-in animation):
  - AI-generated summary paragraph
  - **Capability tags**: Row of pill badges. AI-generated ones use accent-light blue; custom (user-added) ones use green. Each tag shows a capability label (e.g., "Problem Solving", "Leadership Under Pressure").
  - **Custom tag input**: Small text input + "Add" button. User can type and add their own tags to the profile.
- **Advancement button** (conditional):
  - "Switch Roles" — if more turns remain in the current question
  - "Continue to Question X" — if moving to the next question
  - "Finish Workshop" — if all rounds are complete → advances to Complete screen

**Storyteller path** (any phase):

- **Green message box** (`.ws-storyteller-message`): Solid green-tinted background card that reads "Share your story with your partner. They are taking notes." Clear, calm instructional text.
- No inputs. Student simply talks.
- Page polls `workshop-room` every 5 seconds to detect when the interviewer has advanced the round, then auto-navigates forward.

**"Change Room" button** (always at bottom, secondary style) — exits the interview and returns to Room Picker.

**User Flows:**
- Interviewer: write notes → submit → view AI questions → write follow-up → submit → generate profile → add custom tags → advance round
- Storyteller: read prompt → talk → wait for partner to advance → auto-advance
- Either: "Change Room" → exit to Room Picker

**States:**
- Notes phase (textarea + counter + disabled submit)
- Notes sufficient (submit enabled)
- Notes loading/submitting
- Follow-up phase (AI cards + second textarea)
- Generating AI questions (loading dots replace button)
- Profile phase (profile card visible)
- Generating profile (loading dots)
- Storyteller waiting (green message, no input)

**Data:**
- Prompts loaded from session data (stored in `interview` store)
- Submission autosaved on every keystroke (debounced)
- AI follow-ups fetched from `workshop-followup`
- AI profile fetched from `workshop-profile`
- Role determined by alphabetical sort of both student names

---

#### Screen 5: Complete — `complete`
(`src/lib/components/interview/CompleteScreen.svelte`)

**Purpose:** End-of-session summary. Student sees all their capability profiles and can download a PDF.

**Layout:** Centered single-column card. Header text, then per-round profile cards stacked vertically.

**Components:**
- Card heading: `h2` "All rounds complete!"
- **Per-round profile cards**: One card per question/round. Each card shows:
  - Round label (e.g., "Round 1")
  - AI-generated summary paragraph
  - Row of capability tags (same pill styling as interview screen — blue for AI, green for custom)
- **"Download Your Profile (PDF)" button**: Primary accent button. Opens a new browser window/tab with a complete self-contained HTML document styled for print. Includes a "Save as PDF" print button within that window. **Note:** Will fail silently if browser blocks pop-ups.
- **Secondary action buttons**: "Back to Rooms" / "Join a Different Session" / "Leave Session" — all secondary outlined style, stacked or in a row.

**User Flows:**
1. Land here after all interview rounds complete
2. Read profiles → click "Download Your Profile (PDF)" → new window opens with printable profile
3. "Back to Rooms" → returns to Room Picker (can continue in a new room)
4. "Join a Different Session" → clears state, returns to Entry screen
5. "Leave Session" → clears all state, returns to Entry screen

**States:**
- Loading (dots while fetching profiles from API)
- Loaded (profiles displayed)
- Empty (if profiles fail to load — not explicitly handled with a UI state)

**Data:** Fetches all round profiles from `workshop-room` on mount.

---

### Facilitator Dashboard — `/dashboard`
(`src/routes/dashboard/+page.svelte` + `src/lib/components/dashboard/`)

Single route with 4 internal screens. Same fly/fade transition system as the interview route.

#### Persistent Shell

**Header** (always visible):
- `h1`: "Workshop Dashboard" — large, centered
- `p`: Dynamic subtitle — "Facilitator view" on login/session screens; "Session: {id}" when inside a session
- Conditional **"Copy Join Link" button** — small link-style button (not a solid button) shown when a session is active. Copies the session join URL to clipboard.

**Bottom Navigation** (mobile only, ≤600px, hidden on login screen):
Three tabs:
- `☰ Sessions`
- `◉ Monitor`
- `◆ Analytics`
Active item highlighted in accent color.

---

#### Screen 1: Login — `login`
(`src/lib/components/dashboard/LoginScreen.svelte`)

**Purpose:** Authenticate the facilitator before access to any session management.

**Layout:** Centered card, max-width 400px. Narrower than student screens to feel more "admin."

**Components:**
- Card heading: `h2` "Facilitator Login"
- **Password input** — standard text input, type password
- **Error message** (conditional) — red text shown on incorrect password
- **"Log In" button** — primary accent button, full width

**User Flows:**
1. Enter password → click "Log In" → if correct, server returns a facilitator session cookie and advances to Session screen
2. Wrong password → inline error appears

**States:**
- Default (empty)
- Error (wrong password message shown)

**Data:** No API call. Client-side password check against hardcoded config value. Auth state saved to `sessionStorage`.

---

#### Screen 2: Session Management — `session`
(`src/lib/components/dashboard/SessionScreen.svelte`)

**Purpose:** Create new sessions and see existing ones.

**Layout:** Single column, max-width 600px. Two visual sections: "Create New Session" card at top, then session lists below.

**Components:**

**Create New Session card:**
- Card heading: `h2` "Create New Session"
- **Session Name input** — text field
- **Number of Rooms input** — number input, min 1, max 50
- **Number of Questions input** — number input, min 1, max 10. Helper text: "Each question is a full cycle — both partners take turns"
- **Question prompt textareas** — a dynamic array of textareas, one per question. Pre-filled with a default prompt text (editable). Add/remove as the question count changes.
- **"Create Session" / "Creating..." button** — primary accent button, full width. Shows "Creating..." while the API call is in flight.

**Live Sessions list:**
- Section heading: "Live Sessions"
- One `SessionCard` per active session (sorted by recency)

**Previous Sessions list:**
- Section heading: "Previous Sessions"
- One `SessionCard` per ended session

**User Flows:**
1. Fill out form → click "Create Session" → POST to `workshop-session` → new `SessionCard` appears in Live Sessions
2. Click "Monitor" on a live session card → advances to Monitor screen for that session
3. Click "End Session" on a live session card → DELETE to `workshop-session` → card moves to Previous Sessions
4. Click "View Analytics" on an ended session → advances to Analytics screen

**States:**
- Empty state (no sessions yet — no explicit empty state UI, just empty lists)
- Creating (button disabled + "Creating..." text)
- Live sessions present
- Previous sessions present

**Data:** Fetches all sessions from `workshop-session` on mount. Session code displayed in monospace badge.

---

#### Screen 3: Live Monitor — `dashboard`
(`src/lib/components/dashboard/MonitorScreen.svelte`)

**Purpose:** Real-time monitoring of all active rooms. The facilitator's primary tool during a workshop.

**Layout:** Full-width (max 1080px) with a sticky overview bar at top, then a toolbar row, then a responsive grid of room cards.

**Components:**

**OverviewBar** (sticky, `.ws-overview-bar`):
(`src/lib/components/dashboard/OverviewBar.svelte`)
- Left: large total room count number (e.g., "12")
- Middle: three colored dot counts — red count, yellow count, green count (each with a dot indicator of its color)
- Right: a strip of small dots (one per room, colored by status) — gives a visual "at a glance" heat map of all rooms
- Far right: status badge — **"LIVE"** (green, pulsing animation) when connected, **"RECONNECTING"** (yellow/amber) when polling is failing

**Toolbar row:**
- "← Back to Sessions" — secondary button
- "Download JSON" — secondary button (downloads full session data as JSON file)

**Room grid** (`.ws-rooms-grid`):
- CSS Grid: `repeat(auto-fill, minmax(320px, 1fr))` — fills available width with cards of minimum 320px
- On mobile: single column
- Cards sorted: red → yellow → green → unclassified (most urgent first)
- Each `RoomCard` component (see below)

**NudgeModal** (overlay, conditional):
- Rendered above everything when a facilitator clicks "Send Nudge" on a room card

**Polling architecture (invisible to user but affects live feel):**
- Every 2s: lightweight pulse refresh (`workshop-pulse`) — updates student presence + word counts + typing activity
- Every 15s: full room refresh — replaces all room data
- Every 12s: classify "dirty" (changed since last classification) rooms
- Every 30s: flag inactive rooms (no heartbeat > 90s) as red

**User Flows:**
1. Real-time updates: room cards update automatically — status colors shift, word counts increment, typing dots appear/disappear
2. Click "Send Nudge" on any room card → NudgeModal opens for that room
3. "← Back to Sessions" → returns to Session screen
4. "Download JSON" → triggers file download

**States:**
- Loading (initial fetch)
- Live (cards updating)
- RECONNECTING badge (polling failure)
- Individual room states: red / yellow / green / pending (unclassified)

**Data:** All room data from the session, polled continuously.

---

#### Screen 4: Analytics — `analytics`
(`src/lib/components/dashboard/AnalyticsScreen.svelte`)

**Purpose:** Post-session debrief. Comprehensive view of engagement, AI-generated insights, per-room performance, and capability themes.

**Layout:** Single column, max 1080px. Toolbar at top, then a series of full-width cards stacked vertically.

**Toolbar:**
- "← Back to Sessions" — secondary button
- "Download Analytics" — secondary button (JSON download)

**Card 1 — Session Overview:**
- Card heading: "Session Overview"
- Row of stat tiles: Session date, Duration, Total rooms, Total students, Questions, Total words — each tile shows a number (large) with a label (small, muted) beneath it

**Card 2 — Engagement Breakdown:**
- Card heading: "Engagement Breakdown"
- **Stacked horizontal bar**: A single full-width bar divided into colored segments proportional to room counts — green segment, yellow segment, red segment, grey segment (empty rooms)
- **Legend**: Row of color+label pairs (e.g., "● High Engagement: 8 rooms")

**Card 3 — AI Analysis:**
- Card heading: "AI Analysis"
- **Overall assessment** — a paragraph of AI-generated narrative text
- **Engagement narrative** — separate AI-generated text block
- **Expandable sections** (accordion-style, collapsed by default?): Patterns, What Worked, Areas for Improvement, Recommendations — each as a heading that reveals a list/paragraph when expanded

**Card 4 — Room Performance:**
- Card heading: "Room Performance"
- Sorting controls: small buttons/tabs to sort by Status / Word Count / Room Number
- **Mini room cards grid**: Each mini card shows:
  - Status badge (red/yellow/green)
  - Room name + student names
  - Word count
  - Submissions count
  - Nudges count
  - Rounds completed
  - AI profile summary (truncated)

**Card 5 — Capability Highlights** (conditional, only if AI found themes):
- Card heading: "Capability Highlights"
- AI-generated narrative about themes across all rooms
- **All capability tags**: Every tag from every room's AI profiles, displayed as a collection of pill badges

**User Flows:**
1. Land here after clicking "View Analytics" on an ended session
2. Read insights → "← Back to Sessions"
3. "Download Analytics" → JSON download

**States:**
- Loading (fetching analytics — may be slow, involves AI generation)
- Loaded (all cards visible)
- Cached (if same session viewed twice, returns cached result instantly)

**Data:** Fetched from `workshop-analytics`. Result is cached client-side so the second visit to this screen is instant.

---

## 3. Shared Components

### `WaitingDots`
(`src/lib/components/WaitingDots.svelte`)

- **Appearance:** 3 circular dots side by side in accent color. Each pulses with a `ws-pulse` CSS animation (scale/opacity). Delays staggered: 0s, 0.2s, 0.4s — creating a "bouncing" wave effect.
- **Usage:** Interview screen (generating AI content), Waiting screen (partner join), Complete screen (loading profiles), anywhere an async operation is in progress.
- **Props:** None — purely presentational.
- **States:** Always animating when visible. No static state.

---

### `NudgeBanner`
(`src/lib/components/NudgeBanner.svelte`)

- **Appearance:** A fixed-position banner anchored to the very top of the viewport. Dark/dark-adjacent background (blends with page top). Contains two lines: "FROM YOUR FACILITATOR" in small uppercase muted text, then the message in normal body text. A white `×` dismiss button at the far right (70% opacity).
- **Behavior:** Starts off-screen at `translateY(-100%)`. Slides down to `translateY(0)` via CSS transition when visible. Disappears (slides back up) when dismissed or when no nudge is pending.
- **Usage:** Student interview screens only, when a facilitator sends a nudge to the room.
- **Props:** `message` (string), `visible` (boolean).
- **States:** Hidden (off-screen), visible (slid down).
- **z-index:** 1000 — always above all other content.

---

### `BottomNav`
(`src/lib/components/BottomNav.svelte`)

- **Appearance:** Fixed bottom bar. Full viewport width. Background: surface color (white in light mode, dark in dark mode). Subtle top border. Each tab item: icon (emoji/unicode symbol) stacked above a small label. Active item: accent color icon and label + accent-light background pill around the item.
- **Desktop behavior:** Hidden via `display: none` at `>600px`. Never visible on desktop.
- **Mobile behavior:** Visible at `≤600px`. Sits above device safe-area inset (uses `env(safe-area-inset-bottom)`).
- **Usage:** Both `/interview` and `/dashboard`. Interview uses icons ⌂✎★; Dashboard uses ☰◉◆. Hidden on screens where navigation doesn't make sense (entry screens, login).
- **Props:** `items` (array of `{ icon, label, active, onclick }`). Hidden if `items.length === 0`.
- **States:** Each item has active vs inactive state. No hover/focus state defined for touch.

---

### `NudgeModal`
(`src/lib/components/dashboard/NudgeModal.svelte`)

- **Appearance:** Full-screen overlay (dark semi-transparent backdrop, `z-index: 200`). Centered modal card. Heading "Send Nudge" + "To Room {id}". Three preset suggestion buttons (full-width, selectable — clicking fills the textarea). A textarea ("Or write your own"). Footer with "Cancel" (secondary) + "Send Nudge" / "Sending..." (primary, disabled while sending).
- **Usage:** Dashboard Monitor screen only, triggered by "Send Nudge" on a RoomCard.
- **Props:** `roomId`, `onClose`, `onSend`.
- **Behavior:** Clicking outside the modal (on the overlay) closes it. **Note:** Keyboard interaction on overlay click is suppressed (a11y warning in source).
- **States:** Idle, preset selected (textarea pre-filled), sending (button disabled + "Sending..."), sent (closes).
- **Preset suggestions (hardcoded):**
  1. "Translate what your partner DID into what an employer would value..."
  2. "Ask your partner: what was the hardest part of that situation?..."
  3. "Try to get more specific — names, timelines, outcomes."

---

### `RoomCard`
(`src/lib/components/dashboard/RoomCard.svelte`)

- **Appearance:** A card in a grid. Contains:
  - **Header row:** "Room {id}" (bold), a pulsing green dot if actively typing (last input < 8s ago), a status badge (colored pill: red/yellow/green, or grey "Pending")
  - **Students row:** "{interviewer name} interviewing {storyteller name}" — role assignments determined alphabetically
  - **Meta row:** Small muted text — "Q{n} · Turn {n}", elapsed time (MM:SS format, live updating every second), word count, relative last-input time (e.g., "23s ago")
  - **Preview text:** First 150 characters of latest notes, truncated with ellipsis. Clicking the preview toggles full/truncated display. **Note:** Click interaction lacks keyboard handler (a11y warning).
  - **AI reasoning:** Italic, muted text below preview — the AI's classification reasoning.
  - **"Send Nudge" button:** Secondary small button at card bottom
- **Status color treatments:**
  - Red: red border-left, red badge, red background tint
  - Yellow: yellow/amber treatment
  - Green: green treatment
  - Pending/grey: neutral grey treatment
- **Flash animation:** Cards briefly flash (subtle background pulse) when they receive new data from polling.
- **Props:** `room` object with full room state.
- **States:** Each room card is independently colored. Active typing dot is live (updates every 2s from pulse). Time display ticks every 1s.

---

### `SessionCard`
(`src/lib/components/dashboard/SessionCard.svelte`)

- **Appearance:** A list-item card (not grid card). Contains:
  - **Session name** (bold) + "(ended)" suffix if session has ended
  - **Meta:** Room count, created relative time, ended relative time (if applicable)
  - **Session code badge:** Monospace text with letter-spacing, accent background, small size — visually distinct. This is the code students type in.
  - **Action buttons** (row): Monitor (live sessions only), Copy Join Link, Download JSON, End Session (red/danger style), View Analytics (ended sessions only)
- **Usage:** Session Management screen, in both "Live" and "Previous" lists.
- **Props:** `session` object, `onMonitor`, `onAnalytics`, `onEnd` callbacks.
- **States:** Live session (all buttons), Ended session (no Monitor/End, shows View Analytics).

---

### `OverviewBar`
(`src/lib/components/dashboard/OverviewBar.svelte`)

- **Appearance:** A sticky bar fixed to the top of the Monitor screen content area. Background: surface color with a bottom border. Contains a flex row of:
  - Large number (total rooms)
  - Three dot+count pairs (red / yellow / green)
  - A strip of tiny dots (one per room, colored) — a minimap of session health
  - LIVE / RECONNECTING badge (right side)
- **Props:** `rooms` array, `connected` boolean.
- **States:** LIVE (connected, green pulsing badge), RECONNECTING (not connected, amber badge).

---

## 4. Navigation & Information Architecture

### Overall Structure

```
/ (root)
└── → redirects to /interview

/interview          (student app — linear state machine)
  entry → rooms → waiting → interview → complete
  (back-navigation: "Leave Session", "Change Room", "Join a Different Session")

/dashboard          (facilitator app — branching state machine)
  login → session → monitor (dashboard)
                  → analytics
```

### How Users Move Between Screens

**Students:**
- **Forward:** Automatically or via primary action button (form submit, tile click, advance button)
- **Backward:** Via secondary buttons — "Leave Session" (→ entry), "Change Room" (→ rooms), "Join a Different Session" (→ entry), "Back to Rooms" (→ rooms from complete)
- **No browser back button support** — state is in JS/localStorage; browser back would go to the wrong URL (all states are on `/interview`)

**Facilitators:**
- **Forward:** Via button clicks — "Monitor" (→ monitor), "View Analytics" (→ analytics)
- **Backward:** "← Back to Sessions" (→ session screen)
- **Mobile:** Bottom nav tabs can jump between session/monitor/analytics at any time (when relevant session is active)
- **No browser back button support** — same as student side

### Auth Gating
- The dashboard login screen posts to a server-side auth function using `DASHBOARD_PASSWORD`
- A facilitator session cookie protects dashboard-only functions such as session creation, analytics, pulse, move-student, and nudges
- Students have **no dashboard auth gate** — anyone with the session code and a name can join through the student workflow
- `/interview` is public for student access
- `/dashboard` requires a valid facilitator session before showing session management

### Dead Ends & Navigation Issues
- **Complete screen:** "Download Your Profile (PDF)" uses `window.open()` — fails silently if browser blocks pop-ups. No fallback is shown.
- **Storyteller in interview:** No action available except "Change Room" — correctly passive, but could feel stuck without clear communication.
- **Analytics screen:** If AI generation fails, the screen likely shows a loading state forever (no explicit error state).
- **Empty session list:** No empty state message on the Session screen when no sessions exist.
- **Mobile dashboard:** Only 3 nav tabs, but the monitor screen requires a session to be selected first — tapping Monitor on the bottom nav before entering a session may be confusing.

---

## 5. Current Design Patterns

### Typography
- **Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` — system UI font, no Google Fonts or custom typefaces
- **Base size:** `17px` body (slightly larger than typical 16px default)
- **Line height:** `1.65` — generous, reading-optimized
- **Font smoothing:** `-webkit-font-smoothing: antialiased` applied globally
- **Heading sizes:** `h1` ~2rem, `h2` ~1.5rem, `h3` ~1.2rem (exact values not tokenized)
- **Muted text:** `--ci-text-muted: #666666` (light) / `#9ca3af` (dark)
- **Monospace:** Used for session code badges (browser default monospace stack)
- **Consistency:** Moderate — headings follow a pattern, body text is consistent, but utility text (meta rows, labels) has ad hoc sizing

### Color Palette

**Light theme:**
| Token | Value | Usage |
|---|---|---|
| `--ci-bg` | `#fafafa` | Page background |
| `--ci-surface` | `#ffffff` | Card/modal backgrounds |
| `--ci-text` | `#1a1a1a` | Primary text |
| `--ci-text-muted` | `#666666` | Secondary/meta text |
| `--ci-border` | `#e0e0e0` | Input and card borders |
| `--ci-accent` | `#2c5282` | Navy blue — buttons, links, badges, focus rings |
| `--ci-accent-light` | `#ebf4ff` | Light blue — tag backgrounds, active nav bg |
| `--ci-accent-hover` | `#1e3a5f` | Darker navy — hover state on buttons |
| `--ws-red` | `#c53030` | Danger/error/red status rooms |
| `--ws-yellow` | `#d69e2e` | Warning/yellow status rooms |
| `--ws-green` | `#276749` | Success/green status rooms, storyteller bg |

**Dark theme overrides:**
- `--ci-bg`: dark near-black
- `--ci-surface`: dark grey card background
- `--ci-text`: near-white
- `--ci-text-muted`: `#9ca3af` (medium grey)
- `--ci-accent`: `#5b9bd5` (lighter blue, more readable on dark)
- Status colors (red/yellow/green): lightened for dark bg readability

**Summary:** The palette is coherent and purposeful — navy blue for brand/action, semantic red/yellow/green for room status, neutral greys for structure. Two-mode (light/dark) with full token coverage.

### Spacing
- **Container max-width:** `680px` (student), `1080px` (dashboard wide)
- **Container padding:** `0 24px 80px` (80px bottom = room for fixed bottom nav)
- **Card padding:** `24px`
- **Header padding:** `28px 24px 16px`
- **Gap between cards:** approximately `16px` (not tokenized, set per-component)
- **Button padding:** ~`12px 24px` (standard), ~`8px 16px` (small)
- **No formal spacing scale** — values are ad hoc but cluster around multiples of 8px

### Border Radius, Shadows, Borders
- **Global radius:** `--ci-radius: 8px` — applied to cards, inputs, buttons
- **Pill radius:** `999px` — used for badges, tags, capability pills, status dots
- **Card border:** `1px solid var(--ci-border)` — thin, neutral
- **Card shadow:** Subtle `box-shadow` (light mode), slightly more visible in dark mode
- **Input focus:** Colored outline using accent color, no inset shadow
- **Prompt card accent:** `border-left: 4px solid var(--ci-accent)` — left blue stripe on prompt cards
- **Danger button:** Red background (`var(--ws-red)`), no border
- **No heavy shadows or elevation system** — flat design with thin borders

### Animations & Transitions
- **Screen transitions:** `fly({y: 6px, duration: 300ms})` enter / `fade({duration: 150ms})` exit — smooth, directional
- **Nudge banner:** CSS `transition` on `transform: translateY` — slides in from top
- **Waiting dots:** CSS `ws-pulse` keyframe — scale + opacity pulse on 3 staggered dots
- **Follow-up question cards:** Fade in + `translateY(8px → 0)` with staggered delay per card
- **Profile card:** Fade in after AI generation completes
- **Room card flash:** Brief background color pulse when new data arrives (polling update)
- **LIVE badge:** Pulsing glow/opacity animation
- **Active typing dot:** Green dot in RoomCard, no animation — just appears/disappears
- **Theme toggle:** No transition — instant switch

### Responsive Behavior

**Desktop (>600px):**
- Max-width containers centered on page
- Room grid: multi-column CSS Grid (`minmax(320px, 1fr)`)
- Bottom nav: hidden
- Theme toggle: fixed bottom-right

**Mobile (≤600px):**
- Containers go full-width with 24px side padding
- Room grid: single column
- Buttons: stack vertically and go full-width in multi-button groups
- Bottom nav: fixed, visible
- Theme toggle: moves up (above bottom nav height)
- Input font-size forced to `16px` minimum (prevents iOS auto-zoom on focus)
- Modal: anchors to bottom of screen (like a sheet) instead of centering
- No intermediate breakpoints — binary desktop/mobile only

---

## 6. UX Pain Points & Gaps

### Pages That Feel Unfinished

**Session Management screen (`session`):**
- No empty state when there are no sessions — the page just renders two empty sections with no message or call-to-action. First-time facilitators see a blank form and empty space with no guidance.
- The question prompt textarea array is functional but visually rough — no clear ordering indication, no drag-to-reorder.
- No confirmation before "End Session" (danger action with no undo).

**Analytics screen (`analytics`):**
- If the AI call fails or times out (60s limit), there is no error state — the screen shows a perpetual loading state with no timeout message or retry button.
- The expandable AI analysis sections don't have clear affordances — it's unclear they're interactive.
- Stat tiles are unstyled numbers on a card — no visual differentiation between them (e.g., which stats are most important).

**Complete screen (`complete`):**
- PDF download via `window.open()` will silently fail if pop-ups are blocked — no fallback, no instruction, no error.
- No indication whether the PDF is loading or has opened.

### Functionality Present but Poorly Communicated

**Role determination (alphabetical sort):**
- Students are assigned interviewer/storyteller roles based on the alphabetical order of their names — this is deterministic and invisible. Students have no way to know this rule. The role badge appears only when they've already entered the interview, with no explanation of how it was assigned.

**Auto-advance behavior:**
- When the second student joins a waiting room, the screen auto-advances after showing "Both partners are here!" for a beat. There's no countdown or explicit "starting in 3..." — the transition feels abrupt.
- When the storyteller's partner advances the round, the storyteller's screen auto-navigates forward. There's no visible countdown or "your partner is ready" message — it just transitions.

**Autosave:**
- The autosave indicator ("Auto-saved ✓") appears for 2 seconds then disappears. Users who don't notice it may not know their work is being saved. No persistent "last saved" timestamp is shown.

**80-character minimum:**
- The character counter turns red while below threshold but the copy is "X more characters to unlock submit" — accurate but feels punitive. There's no explanation of *why* 80 chars is required.

**Session code lock (pre-filled via URL):**
- The locked, dimmed input communicates "don't change this" but there's no explanatory tooltip or label — first-time users may wonder why the field is disabled.

### Unhandled States

| Screen | Missing State |
|---|---|
| Session list | Empty state (no sessions at all) |
| Analytics | Error state (API failure, timeout) |
| Analytics | Loading skeleton (heavy fetch, shows nothing while loading) |
| Complete screen | Error state if profile fetch fails |
| Complete screen | Pop-up blocker warning for PDF download |
| RoomCard | Offline indicator if room heartbeat has truly gone cold |
| WaitingScreen | Timeout state (partner never joins — waits forever) |
| Interview notes | Loss-of-connection warning (autosave silently failing) |
| Nudge modal | Error state if send fails |

### Visual Hierarchy Issues

**Interview screen — interviewer flow:**
- The role badge ("You are the interviewer") and the prompt card are visually similar weight. New users may not immediately parse which is instructional context vs what they need to *do*.
- The notes textarea label ("Capture what your partner shares") is good but the character counter below reads as an error/warning even before the user has typed anything (it pre-shows the threshold message).

**Dashboard Monitor:**
- The OverviewBar is information-dense — number, three dot counts, a strip of dots, and a LIVE badge all in one bar. On mobile this bar is likely cramped or truncated.
- Room card status badges are the most important signal, but visually compete with the room name (same size/weight).

**Session Management:**
- "Create New Session" form and the sessions list are on the same screen with no visual separator or clear hierarchy. New facilitators may scroll past the form to the (empty) lists before reading it.

### Accessibility Red Flags

1. **Keyboard navigation — RoomCard preview toggle:** `<!-- svelte-ignore a11y_click_events_have_key_events -->` — the preview expansion is a `div` with a click handler, not a button. Keyboard users cannot expand previews.

2. **Keyboard navigation — NudgeModal overlay close:** `<!-- svelte-ignore a11y_click_events_have_key_events -->` — clicking the backdrop to dismiss has no keyboard equivalent. Modal also may not trap focus correctly.

3. **Bottom nav on touch:** No `:focus-visible` styles defined for bottom nav items — keyboard tab navigation would have invisible focus.

4. **Waiting room polling:** No ARIA live region — when "Both partners are here!" appears, screen readers won't announce the change.

5. **Status color alone:** Room status (red/yellow/green) is communicated entirely through color, with no icon or pattern alternative. Color-blind facilitators would need to rely on the text badge (which exists — partially mitigated).

6. **Form labels:** The Entry screen inputs appear to have `placeholder` text only, not associated `<label>` elements — this is a screen reader issue. (Could not confirm fully without seeing exact HTML output.)

7. **Loading states:** `WaitingDots` has no `aria-label` or `role="status"` — assistive technologies won't announce loading.

8. **Theme toggle button:** Only contains an emoji (🌙/☀️) — no `aria-label`, so screen readers would announce "moon" or "sun" without context.

9. **Contrast:** `--ci-text-muted: #666666` on `--ci-bg: #fafafa` is ~4.6:1 — passes AA for normal text but borderline. Meta text in room cards (smaller size) may fail AA.

10. **PDF export:** The PDF is generated as a new browser window — no heading hierarchy or semantic structure confirmed in the AI-generated print document.

---

*Document generated via static code analysis. All file paths are relative to the project root `/Users/shaw8048/Projects/career-workshop-mvp/`.*

# Career-Intelligence Workshop MVP

A peer interview tool for career development workshops. Students pair up in breakout rooms — one tells a story, the other captures notes — and AI generates follow-up questions and capability profiles. A facilitator monitors all rooms from a live dashboard with Red/Yellow/Green status classification and can send nudge prompts to rooms that need help.

**Live URLs:**
- Student interview: https://career-workshop-mvp.netlify.app/interview
- Facilitator dashboard: https://career-workshop-mvp.netlify.app/dashboard

---

## How It Works

### The Workshop Flow

```
Facilitator creates session → Students join rooms → Round 1 → Round 2 → Done
                                                      ↓           ↓
                                              Interviewer A    Interviewer B
                                              captures notes   captures notes
                                                      ↓           ↓
                                              AI follow-ups    AI follow-ups
                                                      ↓           ↓
                                              Capability       Capability
                                              profile for B    profile for A
```

Each student does both roles: interviewer in one round, storyteller in the other. The facilitator watches everything in real time.

---

## User Guide

### For Facilitators

#### 1. Create a Session

1. Go to the **Dashboard** at `/dashboard`
2. Enter the dashboard password
3. Under "Create New Session", enter:
   - **Session Name** — e.g., "CST395 Week 10"
   - **Number of Rooms** — one per student pair (e.g., 12 rooms for 24 students)
4. Click **Create Session**
5. You'll see a **Session ID** (e.g., `a1b2c3`) — share this code with students along with their assigned room numbers

#### 2. Monitor Rooms

Once students start joining, the dashboard shows:

- **Overview bar** (sticky top) — total rooms, Red/Yellow/Green counts, and a dot strip for at-a-glance status
- **Room cards** sorted by urgency (Red first, then Yellow, then Green), each showing:
  - Room number and status badge
  - Student names and who is interviewing whom
  - Current round and elapsed time
  - Word count of notes captured so far
  - Time since last input
  - Preview of latest notes (click to expand)
  - AI classification reasoning

The dashboard auto-refreshes every **15 seconds** with lightweight pulse checks every **2 seconds**.

#### 3. Student Presence & Moving Students

Each student name shows a **green dot** (online) or **red dot** (offline) indicator. Offline students display a timestamp (e.g., "offline since 2:34 PM").

If a student's partner has been offline for more than 2 minutes, a **Move Student** button appears on the room card. Use it to move the stranded student to a different room with an available slot. Both students will see a transition screen and the current round restarts with the new pairing.

#### 4. Understanding Status Colors

| Status | Meaning | Trigger |
|--------|---------|---------|
| **Red** | Stalled — intervene ASAP | Very few words (<15), no input for 3+ minutes, or no heartbeat for 90+ seconds |
| **Yellow** | Shallow — a nudge could help | Low word count (<50), only one submission, or AI detects surface-level notes |
| **Green** | Strong conversation | Detailed notes with specific examples and follow-through |

Classification uses a **hybrid approach**: simple heuristics catch obvious Red cases instantly (no AI cost), and the AI classifies nuanced Yellow vs. Green based on note content quality.

#### 5. Send Nudges

1. Click **Send Nudge** on any room card
2. Choose from three pre-loaded suggestions or write your own:
   - *"Translate what your partner DID into what an employer would value. Not 'good communicator' but 'de-escalated a customer conflict without manager support.'"*
   - *"Ask your partner: what was the hardest part of that situation? What did you try first?"*
   - *"Try to get more specific — names, timelines, outcomes."*
3. Click **Send Nudge** — it appears as a banner on the students' screen within 8 seconds

#### 6. Analytics

After a session ends, view the **Analytics** tab for post-session insights including participation metrics and AI-driven analysis.

---

### For Students

#### 1. Join Your Room

1. Go to the **Interview Page** at `/interview`
2. Enter your **Session Code** and **Name**
3. Pick an available room from the room picker
4. Wait for your partner to join (the page polls automatically)

#### 2. Round 1 — Interview

Roles are assigned automatically (alphabetical by name — first name alphabetically interviews first).

**If you're the interviewer:**

1. Your partner tells their story based on the prompt displayed on screen
2. Capture notes in the textarea — write down what they did, how they approached it, what happened
3. Click **Submit Notes**
4. AI generates 2-3 follow-up questions — ask your partner these to dig deeper
5. Capture follow-up notes and click **Submit Follow-up Notes**
6. Click **End Round & Generate Profile** — AI creates a capability profile translating the story into employer-relevant strengths
7. Review the profile and optionally add your own capability tags
8. Click **Continue to Round 2**

**If you're the storyteller:**

1. Share your story with your partner — take your time, 3-4 minutes is the goal
2. Your screen shows a passive message while your partner takes notes
3. When your partner finishes the round, you'll automatically transition to Round 2

#### 3. Round 2 — Swap

Roles swap. The previous storyteller becomes the interviewer and vice versa. Same flow as Round 1.

#### 4. Nudges

If the facilitator sends a nudge, it appears as a banner at the top of your screen. Read it, then dismiss or let it auto-dismiss after 30 seconds.

#### 5. Notes Auto-Save

Your notes auto-save after you stop typing, so you won't lose work if you accidentally close the tab. Your session also persists in localStorage — refreshing the page resumes where you left off.

#### 6. Disconnection & Reconnection

- If your partner disconnects, you'll see a yellow banner: *"Your partner appears to be disconnected."* — you can keep working.
- When your partner comes back, you'll see a toast: *"Your partner is back online!"*
- If **you** disconnect (close the tab, lose network), your work is auto-saved. When you come back and log in again, you'll see a welcome-back toast confirming your round and role.
- If your partner is gone for a long time, the facilitator may move you to a different room. You'll see a transition screen introducing your new partner, and the current round restarts fresh.

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | SvelteKit 2 / Svelte 5 |
| **Build** | Vite 8 |
| **Backend** | Netlify Functions (Lambda-compatible, CommonJS) |
| **Storage** | Netlify Blobs (key-value JSON store) |
| **AI** | Claude Sonnet 4.6 via Anthropic API |
| **Hosting** | Netlify (SvelteKit SSR adapter + serverless functions) |
| **Node** | >= 18.0.0 |

### File Structure

```
career-workshop-mvp/
├── src/
│   ├── lib/
│   │   ├── api.js                       # Shared fetch helper
│   │   ├── config.js                    # Constants (intervals, API base, password)
│   │   ├── stores/
│   │   │   ├── interview.js             # Interview state (persistent via localStorage)
│   │   │   ├── dashboard.js             # Dashboard state
│   │   │   └── theme.js                 # Theme management
│   │   └── components/
│   │       ├── Toast.svelte             # Reusable auto-dismiss toast notifications
│   │       ├── interview/
│   │       │   ├── EntryScreen.svelte   # Session code + name entry
│   │       │   ├── RoomPicker.svelte    # Choose available room
│   │       │   ├── WaitingScreen.svelte # Wait for partner
│   │       │   ├── InterviewScreen.svelte # Notes, follow-ups, profiles
│   │       │   ├── PartnerChangeScreen.svelte # Transition screen for partner changes
│   │       │   └── CompleteScreen.svelte  # Session complete
│   │       └── dashboard/
│   │           ├── LoginScreen.svelte   # Password auth
│   │           ├── SessionScreen.svelte # Create/list sessions
│   │           ├── MonitorScreen.svelte # Live room monitoring
│   │           ├── AnalyticsScreen.svelte # Post-session analytics
│   │           ├── RoomCard.svelte      # Individual room status card
│   │           ├── OverviewBar.svelte   # Aggregate status bar
│   │           ├── NudgeModal.svelte    # Send nudge dialog
│   │           ├── MoveStudentModal.svelte # Move student between rooms dialog
│   │           └── SessionCard.svelte   # Session list item
│   └── routes/
│       ├── +page.svelte                 # Root redirect
│       ├── interview/+page.svelte       # Student interview page
│       └── dashboard/+page.svelte       # Facilitator dashboard page
├── netlify/
│   └── functions/
│       ├── lib/anthropic.js             # Claude AI wrapper
│       ├── workshop-session.js          # POST: create / GET: list / DELETE: end session
│       ├── workshop-join.js             # POST: student joins a room
│       ├── workshop-leave.js            # POST: student leaves a room
│       ├── workshop-submit.js           # POST: submit interviewer notes
│       ├── workshop-heartbeat.js        # POST: heartbeat (every 15s)
│       ├── workshop-rooms.js            # GET: all rooms for a session
│       ├── workshop-room.js             # GET: single room detail
│       ├── workshop-pulse.js            # GET: lightweight room summaries
│       ├── workshop-classify.js         # POST: classify room (heuristic + AI)
│       ├── workshop-classify-inactive.js # GET: flag rooms with no heartbeat >90s
│       ├── workshop-nudge.js            # POST: send nudge / GET: poll unread nudges
│       ├── workshop-move-student.js     # POST: move student between rooms
│       ├── workshop-followup.js         # POST: AI generates follow-up questions
│       ├── workshop-profile.js          # POST: AI generates capability profile
│       └── workshop-analytics.js        # GET: post-session analytics
├── test/
│   └── simulate-workshop.js            # Full workflow integration test
├── styles.css                           # Global CSS design system
├── svelte.config.js                     # SvelteKit config (Netlify adapter)
├── vite.config.js                       # Vite bundler config
├── netlify.toml                         # Netlify deployment config
└── package.json                         # Dependencies and scripts
```

### Data Model (Netlify Blobs)

All data lives in a single Blobs store called `workshop` with composite keys:

**Session:** `session:{sessionId}`
```json
{
  "id": "a1b2c3",
  "name": "CST395 Week 10",
  "created": "2026-03-20T10:00:00Z",
  "roomCount": 12,
  "rounds": 2,
  "questions": 1,
  "prompts": ["Tell your partner about a time you had to figure something out..."],
  "ended": false,
  "endedAt": null
}
```

**Room:** `room:{sessionId}:{roomId}`
```json
{
  "id": "1",
  "sessionId": "a1b2c3",
  "students": { "student1": "Alice Smith", "student2": "Bob Jones" },
  "currentRound": 1,
  "roundStartTime": "2026-03-20T10:05:00Z",
  "lastHeartbeat": "2026-03-20T10:12:30Z",
  "lastInputTime": "2026-03-20T10:11:45Z",
  "submissions": [
    {
      "studentName": "Alice Smith",
      "role": "interviewer",
      "notes": "Bob described a time when...",
      "wordCount": 87,
      "timestamp": "2026-03-20T10:08:00Z",
      "round": "round1-notes"
    }
  ],
  "aiFollowUps": [
    { "questions": ["What was the hardest part?", "..."], "timestamp": "..." }
  ],
  "capabilityProfiles": [
    {
      "studentName": "Bob Jones",
      "round": 1,
      "capabilities": [
        { "capability": "Independent problem-solving under ambiguity", "evidence": "..." }
      ],
      "summary": "...",
      "generatedAt": "..."
    }
  ],
  "classifications": [
    { "status": "green", "reasoning": "...", "method": "ai", "timestamp": "...", "suggestedNudge": null }
  ],
  "nudges": [
    { "message": "Try to get more specific...", "timestamp": "...", "read": false }
  ],
  "presence": {
    "student1": { "online": true, "lastSeen": "2026-03-20T10:12:30Z" },
    "student2": { "online": true, "lastSeen": "2026-03-20T10:12:28Z" }
  }
}
```

### API Endpoints

All endpoints are at `/.netlify/functions/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `workshop-session` | POST | Create session: `{ name, roomCount, rounds?, questions?, prompts? }` |
| `workshop-session` | GET | List all sessions |
| `workshop-session` | DELETE | End session: `{ sessionId }` |
| `workshop-join` | POST | Join room: `{ sessionId, roomId, studentName }` |
| `workshop-leave` | POST | Leave room: `{ sessionId, roomId, studentName }` |
| `workshop-submit` | POST | Submit notes: `{ sessionId, roomId, studentName, notes, round }` |
| `workshop-heartbeat` | POST | Heartbeat: `{ sessionId, roomId }` |
| `workshop-rooms` | GET | All rooms: `?sessionId=xxx` |
| `workshop-room` | GET | Single room: `?sessionId=xxx&roomId=yyy` |
| `workshop-pulse` | GET | Lightweight room summaries: `?sessionId=xxx` |
| `workshop-classify` | POST | Classify room: `{ sessionId, roomId }` |
| `workshop-classify-inactive` | GET | Check inactivity: `?sessionId=xxx` |
| `workshop-nudge` | POST | Send nudge: `{ sessionId, roomId, message }` |
| `workshop-nudge` | GET | Poll nudges: `?sessionId=xxx&roomId=yyy` |
| `workshop-move-student` | POST | Move student: `{ sessionId, studentName, fromRoomId, toRoomId }` |
| `workshop-followup` | POST | AI follow-ups: `{ sessionId, roomId, notes }` |
| `workshop-profile` | POST | Capability profile: `{ sessionId, roomId, studentName, round }` |
| `workshop-analytics` | GET | Session analytics: `?sessionId=xxx` |

### AI Integration

Three AI functions, all using Claude Sonnet 4.6 via a shared wrapper (`netlify/functions/lib/anthropic.js`):

1. **Follow-up question generator** (`workshop-followup.js`) — Given interviewer notes, generates 2-3 questions that surface specific capabilities, decisions, and outcomes.

2. **Conversation classifier** (`workshop-classify.js`) — Hybrid approach:
   - Heuristic first: word count <15 or inactive >3min → Red; word count <50 or ≤1 submission → Yellow
   - AI fallback: sends notes to Claude for nuanced Yellow/Green classification with reasoning

3. **Capability profiler** (`workshop-profile.js`) — Translates interview notes into employer-relevant strengths with evidence (e.g., "de-escalated customer conflict independently" not "good communicator").

### Polling Strategy

| What | Interval | Direction | Purpose |
|------|----------|-----------|---------|
| Heartbeat | 15s | Student → backend | Keeps room "alive", updates per-student presence (online/lastSeen) |
| Nudge poll | 8s | Student ← backend | Checks for new facilitator nudges |
| Storyteller poll | 5s | Student ← backend | Detects round transitions |
| Pulse check | 2s | Dashboard ← backend | Lightweight status updates |
| Full refresh | 15s | Dashboard ← backend | Complete room data |
| Classification | 12s | Dashboard → backend | Classify rooms (heuristic + AI) |
| Inactivity check | 30s | Dashboard → backend | Flags rooms with no heartbeat >90s |
| Auto-save notes | 1.5s debounce | Student → backend | Saves notes after typing stops |

### Role Assignment

Roles are determined by alphabetical sort of student names:
- **Round 1:** First alphabetically = interviewer
- **Round 2:** Roles swap

This is computed client-side in both interview and dashboard stores to ensure consistency.

### Round Advancement

The interviewer drives the flow. When they click "End Round & Generate Profile":
1. Backend generates the capability profile
2. Backend sets `room.currentRound` to 2 (or 3 if round 2 is done)
3. The storyteller's client polls `workshop-room` every 5 seconds and detects the round change
4. Both clients transition to the next round (or completion screen)

---

## Environment Variables

Set these in the Netlify dashboard under **Site settings > Environment variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI calls |
| `SITE_ID` | Yes | Netlify site ID (for Blobs storage) |
| `NETLIFY_PAT` | Yes | Netlify Personal Access Token (for Blobs storage) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 client secret |
| `SESSION_SECRET` | Yes | Secret for signing session JWTs |
| `OAUTH_REDIRECT_URI` | Yes | OAuth callback URL (e.g., `https://your-site.netlify.app/.netlify/functions/auth-callback`) |

### Getting a Netlify PAT

1. Go to https://app.netlify.com/user/applications#personal-access-tokens
2. Click "New access token"
3. Give it a name (e.g., "workshop-blobs")
4. Copy the token and set it as `NETLIFY_PAT` in your site env vars

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/JeremyCSUMB/career-workshop-mvp.git
cd career-workshop-mvp

# Install dependencies
npm install

# Set up environment variables
# Create a .env file with:
#   ANTHROPIC_API_KEY=your-key
#   SITE_ID=your-netlify-site-id
#   NETLIFY_PAT=your-netlify-pat

# Run locally with Netlify Dev
npx netlify dev
```

This starts a local server at `http://localhost:8888` with SvelteKit dev server proxied through Netlify for functions and Blobs emulation.

### Testing

A full workflow integration test is available:

```bash
# Start the dev server first
npx netlify dev

# In another terminal, run the test
node test/simulate-workshop.js [http://localhost:8888]
```

The test simulates a complete workshop: session creation, student joins, heartbeats, note submissions, AI follow-ups, classification, nudges, capability profiles, round advancement, and analytics.

---

## Deployment

The site auto-deploys on every push to `main` via the GitHub-Netlify integration.

To deploy manually:
```bash
npx netlify deploy --prod
```

---

## Security Notes

- Student authentication uses Google OAuth 2.0 with HTTP-only session cookies (JWT, 8-hour expiry). The dashboard still uses a simple client-side password check for MVP.
- The `NETLIFY_PAT` has broad access to your Netlify account. For production, scope it down or use a service-level token.
- Student names are stored in Netlify Blobs with no encryption. For production, consider PII handling requirements.
- CORS is set to `*` for all function endpoints. For production, restrict to your domain.
- No rate limiting on API endpoints. For production, add rate limiting to prevent abuse.

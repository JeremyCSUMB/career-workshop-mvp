/**
 * Guide Tutorial — Content, mock data, and AI chat starter prompts
 */

// ─── Tutorial Sections ───────────────────────────────────────────────
export const GUIDE_SECTIONS = [
	{
		id: 'welcome',
		number: 1,
		title: 'Welcome & Overview',
		subtitle: 'What this tool does',
		time: '30 sec',
		content: `This dashboard helps you facilitate peer interview workshops where students practice telling career stories and giving each other feedback — with AI support working behind the scenes.`,
		steps: [
			{ icon: '1', text: 'You create a session with breakout rooms and interview prompts.' },
			{ icon: '2', text: 'Students join using a link or session code and pair up in rooms.' },
			{ icon: '3', text: 'You monitor conversations in real time — the system flags rooms that need help.' },
			{ icon: '4', text: 'After the session, AI generates capability profiles and analytics for review.' }
		],
		takeaway: 'You set up the session, students do the talking, and AI helps you keep everyone on track.'
	},
	{
		id: 'create-session',
		number: 2,
		title: 'Creating a Session',
		subtitle: 'Getting started in under a minute',
		time: '2 min',
		content: `To run a workshop, you first create a session. Here's what each field means:`,
		steps: [
			{ icon: 'A', text: 'Session Name — Give it a name your students will recognize (e.g., "Tuesday Section 3").' },
			{ icon: 'B', text: 'Number of Rooms — One room per pair of students. If you have 20 students, create 10 rooms.' },
			{ icon: 'C', text: 'Questions — Each question is one interview round. Students swap roles between rounds.' },
			{ icon: 'D', text: 'Prompts — Customize what students ask each other. A good default is provided.' }
		],
		tips: [
			'Start with 2–3 rooms for your first session to get comfortable.',
			'After creating, you\'ll get a join link — share it with students via your LMS or chat.',
			'Session codes are short (6 characters) so students can type them manually too.'
		],
		takeaway: 'Name it, set room count, pick your prompts, and share the link. That\'s it.'
	},
	{
		id: 'monitoring',
		number: 3,
		title: 'Live Monitoring',
		subtitle: 'Reading the room at a glance',
		time: '3 min',
		content: `Once students join, the Monitor screen shows you every room in real time. The system uses color codes so you can spot who needs help without reading every conversation.`,
		statusGuide: [
			{
				status: 'green',
				label: 'Green — On Track',
				description: 'Students are writing detailed notes with specific examples. The conversation has depth.',
				example: '"Maria described how she resolved a scheduling conflict by creating a shared calendar system for her team — specific names, timelines, and outcomes."'
			},
			{
				status: 'yellow',
				label: 'Yellow — Surface Level',
				description: 'Students are talking, but staying vague. A gentle nudge can help them go deeper.',
				example: '"Good communication skills" without concrete stories or details.'
			},
			{
				status: 'red',
				label: 'Red — Needs Attention',
				description: 'Very low activity, long silence, or the pair may be stuck. Check in or send a nudge.',
				example: 'Only 10 words submitted after 4 minutes, or no input for 3+ minutes.'
			}
		],
		takeaway: 'Green = great, Yellow = could go deeper, Red = check in now.'
	},
	{
		id: 'nudges',
		number: 4,
		title: 'Nudges & Intervention',
		subtitle: 'When and how to step in',
		time: '2 min',
		content: `A "nudge" is a short message you send directly to a room. Students see it as a banner at the top of their screen. Use nudges to guide conversations without interrupting.`,
		steps: [
			{ icon: '1', text: 'Click "Send Nudge" on any room card to open the nudge panel.' },
			{ icon: '2', text: 'Choose a pre-written suggestion or type your own message.' },
			{ icon: '3', text: 'The AI may also suggest a nudge based on what it sees in the room.' },
			{ icon: '4', text: 'Students see the nudge as a subtle banner — it doesn\'t interrupt their flow.' }
		],
		tips: [
			'Nudge red rooms first — they need the most help.',
			'For yellow rooms, try prompts that ask for specifics: names, timelines, outcomes.',
			'You don\'t need to nudge green rooms — they\'re doing great on their own.',
			'One well-timed nudge is better than several. Give students time to respond.'
		],
		takeaway: 'Nudge early for red rooms, gently for yellow, and trust green rooms to keep going.'
	},
	{
		id: 'analytics',
		number: 5,
		title: 'Analytics & Wrap-up',
		subtitle: 'After the session ends',
		time: '1 min',
		content: `When the session ends, the Analytics screen gives you a full picture of how it went.`,
		steps: [
			{ icon: '1', text: 'Engagement Breakdown — See how many rooms were green, yellow, or red overall.' },
			{ icon: '2', text: 'AI Analysis — Patterns observed, what worked, areas for improvement, and recommendations.' },
			{ icon: '3', text: 'Capability Profiles — AI-generated summaries of each student\'s strengths, translated into employer language.' },
			{ icon: '4', text: 'Download Data — Export profiles and raw data as JSON for your records.' }
		],
		takeaway: 'Review the analytics, download profiles for students, and use the AI recommendations to improve next time.'
	}
];

// ─── Mock Room Data for Demo Monitor ─────────────────────────────────
const now = new Date().toISOString();
const minutesAgo = (min) => new Date(Date.now() - min * 60000).toISOString();

export const MOCK_ROOMS = [
	{
		id: '1',
		students: { alex: 'Alex', jordan: 'Jordan' },
		currentRound: 3,
		roundStartTime: minutesAgo(2),
		lastInputTime: minutesAgo(0.3),
		lastHeartbeat: now,
		submissions: [
			{ studentName: 'Alex', round: 'round1-notes', notes: 'Jordan described a time when they had to mediate a conflict between two coworkers in their part-time retail job. They noticed the tension was affecting the whole team, so they organized a brief meeting during break. Jordan listened to both sides and helped them find a compromise on shift scheduling. The manager later asked Jordan to help with future scheduling conflicts.', wordCount: 58, timestamp: minutesAgo(8), aboutStudent: 'Jordan' },
			{ studentName: 'Jordan', round: 'round1-followup', notes: 'Alex asked great follow-ups about what specific phrases Jordan used during the mediation. Jordan mentioned saying "I hear what you\'re both saying" and "What would make this work for everyone?" — concrete de-escalation language.', wordCount: 38, timestamp: minutesAgo(6), aboutStudent: 'Jordan' },
			{ studentName: 'Jordan', round: 'round2-notes', notes: 'Alex talked about building a tracking spreadsheet for their student org budget when the previous treasurer left no records. They spent a weekend reconstructing 6 months of transactions from bank statements and receipts.', wordCount: 36, timestamp: minutesAgo(3), aboutStudent: 'Alex' },
			{ studentName: 'Alex', round: 'round3-notes', notes: 'Currently taking notes on Jordan\'s second story about tutoring younger students in math...', wordCount: 14, timestamp: minutesAgo(0.3), aboutStudent: 'Jordan' }
		],
		classifications: [{ status: 'green', reasoning: 'Detailed, specific notes with concrete examples. Both students are actively engaged and asking follow-up questions.', method: 'ai', timestamp: minutesAgo(1), suggestedNudge: null }],
		nudges: [],
		_studentNames: ['Alex', 'Jordan'],
		_status: 'green',
		_reasoning: 'Detailed, specific notes with concrete examples. Both students are actively engaged and asking follow-up questions.',
		_suggestedNudge: null,
		_wordCount: 146,
		_latestNotes: 'Currently taking notes on Jordan\'s second story about tutoring younger students in math...',
		_submissionSummaries: [
			{ label: 'Alex about Jordan \u00b7 Notes', notes: 'Jordan described a time when they had to mediate a conflict between two coworkers...', wordCount: 58 },
			{ label: 'Jordan about Jordan \u00b7 Follow-up', notes: 'Alex asked great follow-ups about what specific phrases Jordan used...', wordCount: 38 },
			{ label: 'Jordan about Alex \u00b7 Notes', notes: 'Alex talked about building a tracking spreadsheet for their student org budget...', wordCount: 36 },
			{ label: 'Alex about Jordan \u00b7 Notes', notes: 'Currently taking notes on Jordan\'s second story about tutoring younger students in math...', wordCount: 14 }
		],
		_phase: 'notes',
		_lastInputTime: minutesAgo(0.3)
	},
	{
		id: '2',
		students: { sam: 'Sam', taylor: 'Taylor' },
		currentRound: 2,
		roundStartTime: minutesAgo(4),
		lastInputTime: minutesAgo(1),
		lastHeartbeat: now,
		submissions: [
			{ studentName: 'Sam', round: 'round1-notes', notes: 'Taylor described organizing a campus cleanup event. They coordinated 30 volunteers, secured supplies from local businesses, and documented the results with before/after photos for the university newsletter.', wordCount: 33, timestamp: minutesAgo(6), aboutStudent: 'Taylor' },
			{ studentName: 'Taylor', round: 'round2-notes', notes: 'Sam talked about their experience debugging a critical issue in a class project the night before the deadline. They used systematic elimination to isolate the bug.', wordCount: 28, timestamp: minutesAgo(1), aboutStudent: 'Sam' }
		],
		classifications: [{ status: 'green', reasoning: 'Good engagement with specific stories. Both students providing concrete details and examples.', method: 'ai', timestamp: minutesAgo(2), suggestedNudge: null }],
		nudges: [],
		_studentNames: ['Sam', 'Taylor'],
		_status: 'green',
		_reasoning: 'Good engagement with specific stories. Both students providing concrete details and examples.',
		_suggestedNudge: null,
		_wordCount: 61,
		_latestNotes: 'Sam talked about their experience debugging a critical issue in a class project the night before the deadline.',
		_submissionSummaries: [
			{ label: 'Sam about Taylor \u00b7 Notes', notes: 'Taylor described organizing a campus cleanup event. They coordinated 30 volunteers...', wordCount: 33 },
			{ label: 'Taylor about Sam \u00b7 Notes', notes: 'Sam talked about their experience debugging a critical issue...', wordCount: 28 }
		],
		_phase: 'notes',
		_lastInputTime: minutesAgo(1)
	},
	{
		id: '3',
		students: { casey: 'Casey', morgan: 'Morgan' },
		currentRound: 1,
		roundStartTime: minutesAgo(5),
		lastInputTime: minutesAgo(2),
		lastHeartbeat: minutesAgo(1),
		submissions: [
			{ studentName: 'Casey', round: 'round1-notes', notes: 'Morgan said they are a good team player and work well with others.', wordCount: 14, timestamp: minutesAgo(2), aboutStudent: 'Morgan' }
		],
		classifications: [{ status: 'yellow', reasoning: 'Notes are vague — "good team player" without specific stories. Could benefit from a prompt to ask for a concrete example.', method: 'ai', timestamp: minutesAgo(1), suggestedNudge: 'Ask your partner: can you walk me through a specific time you worked on a team? What was your role, and what did you do that made a difference?' }],
		nudges: [],
		_studentNames: ['Casey', 'Morgan'],
		_status: 'yellow',
		_reasoning: 'Notes are vague \u2014 "good team player" without specific stories. Could benefit from a prompt to ask for a concrete example.',
		_suggestedNudge: 'Ask your partner: can you walk me through a specific time you worked on a team? What was your role, and what did you do that made a difference?',
		_wordCount: 14,
		_latestNotes: 'Morgan said they are a good team player and work well with others.',
		_submissionSummaries: [
			{ label: 'Casey about Morgan \u00b7 Notes', notes: 'Morgan said they are a good team player and work well with others.', wordCount: 14 }
		],
		_phase: 'notes',
		_lastInputTime: minutesAgo(2)
	},
	{
		id: '4',
		students: { riley: 'Riley', avery: 'Avery' },
		currentRound: 1,
		roundStartTime: minutesAgo(6),
		lastInputTime: minutesAgo(3),
		lastHeartbeat: minutesAgo(2),
		submissions: [
			{ studentName: 'Riley', round: 'round1-notes', notes: 'Avery mentioned they helped at an event once. Said it went well.', wordCount: 12, timestamp: minutesAgo(3), aboutStudent: 'Avery' }
		],
		classifications: [{ status: 'yellow', reasoning: 'Minimal detail — "helped at an event" is too vague. No specifics about role, challenges, or outcomes.', method: 'ai', timestamp: minutesAgo(1.5), suggestedNudge: 'Try to get more specific — what event was it? What exactly did your partner do? What was the result?' }],
		nudges: [],
		_studentNames: ['Riley', 'Avery'],
		_status: 'yellow',
		_reasoning: 'Minimal detail \u2014 "helped at an event" is too vague. No specifics about role, challenges, or outcomes.',
		_suggestedNudge: 'Try to get more specific \u2014 what event was it? What exactly did your partner do? What was the result?',
		_wordCount: 12,
		_latestNotes: 'Avery mentioned they helped at an event once. Said it went well.',
		_submissionSummaries: [
			{ label: 'Riley about Avery \u00b7 Notes', notes: 'Avery mentioned they helped at an event once. Said it went well.', wordCount: 12 }
		],
		_phase: 'notes',
		_lastInputTime: minutesAgo(3)
	},
	{
		id: '5',
		students: { jamie: 'Jamie', drew: 'Drew' },
		currentRound: 1,
		roundStartTime: minutesAgo(7),
		lastInputTime: minutesAgo(5),
		lastHeartbeat: minutesAgo(4),
		submissions: [
			{ studentName: 'Jamie', round: 'round1-notes', notes: 'idk', wordCount: 1, timestamp: minutesAgo(5), aboutStudent: 'Drew' }
		],
		classifications: [{ status: 'red', reasoning: 'Extremely low engagement — only 1 word submitted after 5+ minutes. Students may be stuck or off-task.', method: 'heuristic', timestamp: minutesAgo(1), suggestedNudge: 'It looks like you might be getting started. Try this: ask your partner to tell you about any time they had to solve a problem — at work, school, or anywhere. Just listen and take notes on what they actually did.' }],
		nudges: [],
		_studentNames: ['Jamie', 'Drew'],
		_status: 'red',
		_reasoning: 'Extremely low engagement \u2014 only 1 word submitted after 5+ minutes. Students may be stuck or off-task.',
		_suggestedNudge: 'It looks like you might be getting started. Try this: ask your partner to tell you about any time they had to solve a problem \u2014 at work, school, or anywhere. Just listen and take notes on what they actually did.',
		_wordCount: 1,
		_latestNotes: 'idk',
		_submissionSummaries: [
			{ label: 'Jamie about Drew \u00b7 Notes', notes: 'idk', wordCount: 1 }
		],
		_phase: 'notes',
		_lastInputTime: minutesAgo(5)
	},
	{
		id: '6',
		students: { chris: 'Chris' },
		currentRound: 1,
		roundStartTime: null,
		lastInputTime: null,
		lastHeartbeat: minutesAgo(1),
		submissions: [],
		classifications: [],
		nudges: [],
		_studentNames: ['Chris'],
		_status: '',
		_reasoning: '',
		_suggestedNudge: null,
		_wordCount: 0,
		_latestNotes: '',
		_submissionSummaries: [],
		_phase: 'waiting',
		_lastInputTime: null
	}
];

export const MOCK_TOTAL_ROUNDS = 4;

// ─── AI Chat Starter Prompts ─────────────────────────────────────────
export const CHAT_STARTERS = [
	'How do I create my first session?',
	'What do the Red/Yellow/Green colors mean?',
	'When should I send a nudge?',
	'How do students join my session?',
	'What happens after the session ends?',
	'Can I customize the interview prompts?'
];

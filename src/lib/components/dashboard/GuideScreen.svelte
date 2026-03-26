<script>
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import DemoMonitor from './DemoMonitor.svelte';
	import { GUIDE_SECTIONS } from './guideData.js';

	let { onComplete } = $props();

	const STORAGE_KEY = 'ws_guide_progress';

	// Load saved progress
	function loadProgress() {
		if (!browser) return new Set();
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			return saved ? new Set(JSON.parse(saved)) : new Set();
		} catch { return new Set(); }
	}

	function saveProgress(completed) {
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
	}

	let completedSections = $state(loadProgress());
	let activeSection = $state(GUIDE_SECTIONS[0].id);

	let progressPercent = $derived(Math.round((completedSections.size / GUIDE_SECTIONS.length) * 100));

	function toggleSection(id) {
		activeSection = activeSection === id ? null : id;
	}

	function markDone(id) {
		completedSections.add(id);
		completedSections = new Set(completedSections);
		saveProgress(completedSections);

		// Auto-advance to next section
		const idx = GUIDE_SECTIONS.findIndex(s => s.id === id);
		if (idx < GUIDE_SECTIONS.length - 1) {
			activeSection = GUIDE_SECTIONS[idx + 1].id;
		}
	}

	function handleFinish() {
		if (browser) localStorage.setItem('ws_guide_completed', 'true');
		onComplete();
	}

	let allDone = $derived(completedSections.size === GUIDE_SECTIONS.length);
</script>

<div class="ws-guide" in:fly={{ y: 4, duration: 250 }}>
	<!-- Progress bar -->
	<div class="ws-guide__progress">
		<div class="ws-guide__progress-bar">
			<div class="ws-guide__progress-fill" style="width: {progressPercent}%"></div>
		</div>
		<span class="ws-guide__progress-label">
			{completedSections.size} of {GUIDE_SECTIONS.length} completed
		</span>
	</div>

	<!-- Header -->
	<div class="ws-guide__header">
		<h2>Workshop Dashboard Guide</h2>
		<p>Learn how to run a peer interview workshop in 5 short steps. Click each section to expand.</p>
	</div>

	<!-- Sections -->
	<div class="ws-guide__sections">
		{#each GUIDE_SECTIONS as section (section.id)}
			{@const isActive = activeSection === section.id}
			{@const isDone = completedSections.has(section.id)}

			<div
				class="ws-guide__section"
				class:ws-guide__section--active={isActive}
				class:ws-guide__section--done={isDone}
			>
				<!-- Section header (always visible, clickable) -->
				<button class="ws-guide__section-header" onclick={() => toggleSection(section.id)}>
					<span class="ws-guide__section-number" class:ws-guide__section-number--done={isDone}>
						{isDone ? '\u2713' : section.number}
					</span>
					<div class="ws-guide__section-title-group">
						<span class="ws-guide__section-title">{section.title}</span>
						<span class="ws-guide__section-subtitle">{section.subtitle}</span>
					</div>
					<span class="ws-guide__section-time">{section.time}</span>
					<span class="ws-guide__section-chevron">{isActive ? '\u25B2' : '\u25BC'}</span>
				</button>

				<!-- Section body (collapsible) -->
				{#if isActive}
					<div class="ws-guide__section-body" in:fly={{ y: -8, duration: 200 }}>
						<p class="ws-guide__section-content">{section.content}</p>

						<!-- Steps list -->
						{#if section.steps}
							<div class="ws-guide__steps">
								{#each section.steps as step}
									<div class="ws-guide__step">
										<span class="ws-guide__step-icon">{step.icon}</span>
										<span>{step.text}</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Status guide (for monitoring section) -->
						{#if section.statusGuide}
							<div class="ws-guide__status-guide">
								{#each section.statusGuide as item}
									<div class="ws-guide__status-item ws-guide__status-item--{item.status}">
										<div class="ws-guide__status-header">
											<span class="ws-guide__status-dot ws-guide__status-dot--{item.status}"></span>
											<strong>{item.label}</strong>
										</div>
										<p>{item.description}</p>
										<div class="ws-guide__status-example">
											<em>Example: {item.example}</em>
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Demo Monitor (embedded in the monitoring section) -->
						{#if section.id === 'monitoring'}
							<DemoMonitor />
						{/if}

						<!-- Tips -->
						{#if section.tips}
							<div class="ws-guide__tips">
								<strong>Tips:</strong>
								<ul>
									{#each section.tips as tip}
										<li>{tip}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Takeaway -->
						<div class="ws-guide__callout">
							<strong>Key Takeaway:</strong> {section.takeaway}
						</div>

						<!-- Mark done / Next -->
						<div class="ws-guide__section-actions">
							{#if !isDone}
								<button class="ws-btn ws-btn--small" onclick={() => markDone(section.id)}>
									Mark Complete & Continue
								</button>
							{:else}
								<span class="ws-guide__done-label">\u2713 Completed</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Finish section -->
	{#if allDone}
		<div class="ws-guide__finish" in:fly={{ y: 8, duration: 300 }}>
			<h3>You're ready!</h3>
			<p>You've completed the guide. Head to Sessions to create your first workshop.</p>
			<button class="ws-btn" onclick={handleFinish}>
				Go to Sessions
			</button>
		</div>
	{/if}
</div>

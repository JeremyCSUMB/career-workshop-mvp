<script>
	import { api } from '$lib/api.js';
	import { onMount, onDestroy, tick } from 'svelte';

	let { visible = false, roomId = '', sessionId = '', suggestedNudge = '', onClose } = $props();

	const SUGGESTIONS = [
		'Translate what your partner DID into what an employer would value. Not "good communicator" but "de-escalated a customer conflict without manager support."',
		'Ask your partner: what was the hardest part of that situation? What did you try first?',
		'Try to get more specific \u2014 names, timelines, outcomes.'
	];

	let customText = $state('');
	let selectedIdx = $state(-1);
	let sending = $state(false);
	let modalEl = $state(null);
	let previousFocus = null;

	$effect(() => {
		if (visible) {
			customText = suggestedNudge || '';
			selectedIdx = -1;
			previousFocus = document.activeElement;
			tick().then(() => {
				if (modalEl) {
					const first = modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
					if (first) first.focus();
				}
			});
		} else if (previousFocus) {
			previousFocus.focus();
			previousFocus = null;
		}
	});

	function selectSuggestion(idx) {
		selectedIdx = idx;
		customText = SUGGESTIONS[idx];
	}

	async function send() {
		const message = customText.trim();
		if (!message) return;
		sending = true;
		try {
			await api('workshop-nudge', {
				body: { sessionId, roomId, message }
			});
			onClose();
		} catch (err) {
			alert('Error sending nudge: ' + err.message);
		} finally {
			sending = false;
		}
	}

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') {
			onClose();
			return;
		}
		if (e.key === 'Tab' && modalEl) {
			const focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

{#if visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="ws-modal-overlay ws-modal-overlay--visible"
		onclick={handleOverlayClick}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Send nudge to Room {roomId}"
	>
		<div class="ws-modal" bind:this={modalEl}>
			<h3>Send Nudge</h3>
			<p>To Room {roomId}</p>
			<div class="ws-nudge-suggestions">
				{#each SUGGESTIONS as suggestion, idx}
					<button
						class="ws-nudge-suggestion"
						class:ws-nudge-suggestion--selected={selectedIdx === idx}
						onclick={() => selectSuggestion(idx)}
					>
						{suggestion}
					</button>
				{/each}
			</div>
			<div class="ws-field">
				<label class="ws-label" for="nudge-custom">Or write your own</label>
				<textarea
					id="nudge-custom"
					class="ws-textarea"
					style="min-height:80px;"
					placeholder="Type a custom nudge..."
					bind:value={customText}
				></textarea>
			</div>
			<div class="ws-modal__footer">
				<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onClose}>Cancel</button>
				<button class="ws-btn ws-btn--small" onclick={send} disabled={sending}>
					{sending ? 'Sending...' : 'Send Nudge'}
				</button>
			</div>
		</div>
	</div>
{/if}

<script>
	import { api } from '$lib/api.js';

	let { visible = false, roomId = '', sessionId = '', suggestedNudge = '', onClose } = $props();

	const SUGGESTIONS = [
		'Translate what your partner DID into what an employer would value. Not "good communicator" but "de-escalated a customer conflict without manager support."',
		'Ask your partner: what was the hardest part of that situation? What did you try first?',
		'Try to get more specific \u2014 names, timelines, outcomes.'
	];

	let customText = $state('');
	let selectedIdx = $state(-1);
	let sending = $state(false);

	$effect(() => {
		if (visible) {
			customText = suggestedNudge || '';
			selectedIdx = -1;
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
</script>

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="ws-modal-overlay ws-modal-overlay--visible" onclick={handleOverlayClick}>
		<div class="ws-modal">
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

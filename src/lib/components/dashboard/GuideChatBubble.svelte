<script>
	import { onMount, tick } from 'svelte';
	import { api } from '$lib/api.js';
	import { CHAT_STARTERS } from './guideData.js';

	let open = $state(false);
	let messages = $state([]);
	let input = $state('');
	let loading = $state(false);
	let messagesEl = $state(null);

	function toggle() {
		open = !open;
	}

	async function scrollToBottom() {
		await tick();
		if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	async function sendMessage(text) {
		const trimmed = (text || input).trim();
		if (!trimmed || loading) return;

		messages.push({ role: 'user', content: trimmed });
		messages = [...messages];
		input = '';
		loading = true;
		await scrollToBottom();

		try {
			const history = messages.map(m => ({ role: m.role, content: m.content }));
			const data = await api('workshop-guide-chat', { body: { messages: history } });
			messages.push({ role: 'assistant', content: data.reply || 'Sorry, I couldn\'t generate a response.' });
		} catch (err) {
			messages.push({ role: 'assistant', content: 'Something went wrong. Please try again.' });
		} finally {
			loading = false;
			messages = [...messages];
			await scrollToBottom();
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function handleStarter(prompt) {
		sendMessage(prompt);
	}

	// Simple markdown to HTML (bold, italic, inline code, bullet lists, line breaks)
	function renderMarkdown(text) {
		let html = text
			// Escape HTML
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			// Code blocks (triple backtick)
			.replace(/```([^`]*?)```/gs, '<pre><code>$1</code></pre>')
			// Inline code
			.replace(/`([^`]+?)`/g, '<code>$1</code>')
			// Bold
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			// Italic
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			// Bullet lists (lines starting with - or *)
			.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
			// Wrap consecutive <li> in <ul>
			.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
			// Line breaks (double newline = paragraph, single = br)
			.replace(/\n\n/g, '</p><p>')
			.replace(/\n/g, '<br>');
		return `<p>${html}</p>`;
	}

	// Show starters when no messages yet
	let showStarters = $derived(messages.length === 0 && !loading);
</script>

<!-- Floating chat bubble button -->
{#if !open}
	<button class="ws-chat-bubble" onclick={toggle} aria-label="Open workshop assistant">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		</svg>
	</button>
{/if}

<!-- Chat panel -->
{#if open}
	<div class="ws-chat-panel">
		<div class="ws-chat-panel__header">
			<div>
				<strong>Workshop Assistant</strong>
				<span class="ws-chat-panel__subtitle">Ask anything about using this tool</span>
			</div>
			<button class="ws-chat-panel__close" onclick={toggle} aria-label="Close chat">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>

		<div class="ws-chat-panel__messages" bind:this={messagesEl}>
			{#if showStarters}
				<div class="ws-chat-panel__welcome">
					<p>Hi! I can help you with any questions about the workshop dashboard. Here are some common ones:</p>
					<div class="ws-chat-starters">
						{#each CHAT_STARTERS as prompt}
							<button class="ws-chat-starter" onclick={() => handleStarter(prompt)}>
								{prompt}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#each messages as msg}
				<div class="ws-chat-msg ws-chat-msg--{msg.role}">
					{#if msg.role === 'assistant'}
						<span class="ws-chat-msg__avatar">AI</span>
					{/if}
					{#if msg.role === 'assistant'}
						<div class="ws-chat-msg__content ws-chat-msg__content--rich">{@html renderMarkdown(msg.content)}</div>
					{:else}
						<div class="ws-chat-msg__content">{msg.content}</div>
					{/if}
				</div>
			{/each}

			{#if loading}
				<div class="ws-chat-msg ws-chat-msg--assistant">
					<span class="ws-chat-msg__avatar">AI</span>
					<div class="ws-chat-msg__content ws-chat-msg__typing">
						<span></span><span></span><span></span>
					</div>
				</div>
			{/if}
		</div>

		<div class="ws-chat-panel__input">
			<input
				type="text"
				placeholder="Ask a question..."
				bind:value={input}
				onkeydown={handleKeydown}
				disabled={loading}
			/>
			<button class="ws-chat-panel__send" onclick={() => sendMessage()} disabled={loading || !input.trim()} aria-label="Send message">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="22" y1="2" x2="11" y2="13"/>
					<polygon points="22 2 15 22 11 13 2 9 22 2"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

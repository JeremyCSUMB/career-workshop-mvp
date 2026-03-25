<script>
	let { text = '', visible = false, onDismiss } = $props();
</script>

<div class="ws-nudge-banner" class:ws-nudge-banner--visible={visible}>
	<div class="ws-nudge-banner__inner">
		<div class="ws-nudge-banner__text">
			<div class="ws-nudge-banner__label">From your facilitator</div>
			<div>{text}</div>
		</div>
		<button class="ws-nudge-banner__dismiss" aria-label="Dismiss" onclick={onDismiss}>&times;</button>
	</div>
</div>

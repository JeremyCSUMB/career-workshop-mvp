<script>
	let { rooms = [], connected = true } = $props();

	let total = $derived(rooms.length);
	let red = $derived(rooms.filter((r) => r._status === 'red').length);
	let yellow = $derived(rooms.filter((r) => r._status === 'yellow').length);
	let green = $derived(rooms.filter((r) => r._status === 'green').length);

	let sortedRooms = $derived(
		[...rooms].sort((a, b) => {
			const order = { red: 0, yellow: 1, green: 2 };
			const oa = order[a._status] ?? 3;
			const ob = order[b._status] ?? 3;
			if (oa !== ob) return oa - ob;
			return String(a.id || '').localeCompare(String(b.id || ''));
		})
	);

	function dotColor(status) {
		if (status === 'red') return 'var(--ws-red)';
		if (status === 'yellow') return 'var(--ws-yellow)';
		if (status === 'green') return 'var(--ws-green)';
		return 'var(--ci-grey-dot)';
	}
</script>

<div class="ws-overview">
	<div class="ws-overview__inner">
		<div class="ws-overview__stat">
			<span class="ws-overview__count">{total}</span>
			<span class="ws-overview__label">rooms</span>
		</div>
		<div class="ws-overview__divider"></div>
		<div class="ws-overview__stat">
			<span class="ws-overview__dot ws-overview__dot--red"></span>
			<span>{red}</span>
		</div>
		<div class="ws-overview__stat">
			<span class="ws-overview__dot ws-overview__dot--yellow"></span>
			<span>{yellow}</span>
		</div>
		<div class="ws-overview__stat">
			<span class="ws-overview__dot ws-overview__dot--green"></span>
			<span>{green}</span>
		</div>
		<div class="ws-overview__divider"></div>
		<div class="ws-dot-strip">
			{#each sortedRooms as room (room.id)}
				<div class="ws-dot-strip__dot" style="background:{dotColor(room._status)}"></div>
			{/each}
		</div>
		<div class="ws-live-indicator" class:ws-live-indicator--connected={connected} class:ws-live-indicator--disconnected={!connected}>
			{connected ? 'LIVE' : 'RECONNECTING'}
		</div>
	</div>
</div>

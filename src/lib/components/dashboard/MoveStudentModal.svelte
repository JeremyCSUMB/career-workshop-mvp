<script>
	import { api } from '$lib/api.js';
	import { tick } from 'svelte';

	let { visible = false, sessionId = '', studentName = '', fromRoomId = '', rooms = [], onClose, onSuccess } = $props();

	let step = $state('select'); // 'select' or 'confirm'
	let selectedRoomId = $state('');
	let sending = $state(false);
	let errorMsg = $state('');
	let modalEl = $state(null);
	let previousFocus = null;

	// Available target rooms: rooms with 0 or 1 students, excluding the source room
	let availableRooms = $derived.by(() => {
		return rooms.filter(r => {
			if (String(r.id) === String(fromRoomId)) return false;
			const names = r._studentNames || [];
			return names.length < 2;
		});
	});

	function getStudentInRoom(room) {
		const names = room._studentNames || [];
		return names.length > 0 ? names[0] : null;
	}

	$effect(() => {
		if (visible) {
			step = 'select';
			selectedRoomId = '';
			errorMsg = '';
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

	function selectRoom(roomId) {
		selectedRoomId = String(roomId);
		step = 'confirm';
		errorMsg = '';
	}

	function backToSelect() {
		step = 'select';
		errorMsg = '';
	}

	async function confirmMove() {
		sending = true;
		errorMsg = '';
		try {
			await api('workshop-move-student', {
				body: { sessionId, studentName, fromRoomId, toRoomId: selectedRoomId }
			});
			onSuccess();
		} catch (err) {
			if (err.status === 409) {
				errorMsg = 'That room is now full. Please choose a different room.';
				step = 'select';
			} else {
				errorMsg = err.message || 'Failed to move student';
			}
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
		aria-label="Move {studentName} to another room"
	>
		<div class="ws-modal" bind:this={modalEl}>
			{#if step === 'select'}
				<h3>Move Student</h3>
				<p>Select a room for <strong>{studentName}</strong> (from Room {fromRoomId})</p>
				{#if errorMsg}
					<div class="ws-move-error">{errorMsg}</div>
				{/if}
				{#if availableRooms.length === 0}
					<p style="color:var(--ci-text-muted);">No available rooms.</p>
				{:else}
					<div class="ws-move-room-list">
						{#each availableRooms as targetRoom}
							{@const existingStudent = getStudentInRoom(targetRoom)}
							<button class="ws-move-room-option" onclick={() => selectRoom(targetRoom.id)}>
								<span class="ws-move-room-option__id">Room {targetRoom.id}</span>
								<span class="ws-move-room-option__student">
									{#if existingStudent}
										{existingStudent}
									{:else}
										<em>Empty</em>
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}
				<div class="ws-modal__footer">
					<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={onClose}>Cancel</button>
				</div>
			{:else}
				<h3>Confirm Move</h3>
				<p>Move <strong>{studentName}</strong> to Room {selectedRoomId}?</p>
				{#if errorMsg}
					<div class="ws-move-error">{errorMsg}</div>
				{/if}
				<div class="ws-modal__footer">
					<button class="ws-btn ws-btn--secondary ws-btn--small" onclick={backToSelect}>Back</button>
					<button class="ws-btn ws-btn--small" onclick={confirmMove} disabled={sending}>
						{sending ? 'Moving...' : 'Confirm Move'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

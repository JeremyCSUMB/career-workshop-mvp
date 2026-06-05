export const ROOM_SLOTS = ['student1', 'student2', 'student3'];
export const DEFAULT_ROOM_SIZE = 2;

export function normalizeRoomSize(value) {
	const n = Number(value);
	return n === 3 ? 3 : DEFAULT_ROOM_SIZE;
}

export function getRoomSlots(roomSize) {
	return ROOM_SLOTS.slice(0, normalizeRoomSize(roomSize));
}

export function normalizeStudents(students, roomSize) {
	const slots = getRoomSlots(roomSize);
	const source = Array.isArray(students)
		? Object.fromEntries(students.map((name, index) => [ROOM_SLOTS[index], name]))
		: (students || {});
	return Object.fromEntries(slots.map((slot) => [slot, source[slot] || null]));
}

export function getStudentNames(students, roomSize) {
	return Object.values(normalizeStudents(students, roomSize)).filter(Boolean);
}

export function findStudentSlot(students, studentName, roomSize) {
	const normalized = normalizeStudents(students, roomSize);
	return getRoomSlots(roomSize).find((slot) => normalized[slot] === studentName) || null;
}

export function rolesForRound(students, round, roomSize) {
	const size = normalizeRoomSize(roomSize);
	const names = getStudentNames(students, size).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	if (names.length < size) return null;
	const turn = (round - 1) % size;

	if (size === 3) {
		return {
			asker: names[turn],
			answerer: names[(turn + 1) % size],
			noteTaker: names[(turn + 2) % size],
			interviewer: names[turn],
			storyteller: names[(turn + 1) % size]
		};
	}

	return {
		asker: names[turn],
		answerer: names[(turn + 1) % size],
		noteTaker: names[turn],
		interviewer: names[turn],
		storyteller: names[(turn + 1) % size]
	};
}

export function questionForRound(round, roomSize) {
	return Math.ceil(round / normalizeRoomSize(roomSize));
}

export function turnForRound(round, roomSize) {
	return ((round - 1) % normalizeRoomSize(roomSize)) + 1;
}

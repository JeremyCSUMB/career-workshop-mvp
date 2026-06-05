const ROOM_SLOTS = ['student1', 'student2', 'student3'];
const DEFAULT_ROOM_SIZE = 2;

function normalizeRoomSize(value) {
  const n = Number(value);
  return n === 3 ? 3 : DEFAULT_ROOM_SIZE;
}

function getRoomSlots(roomSize) {
  return ROOM_SLOTS.slice(0, normalizeRoomSize(roomSize));
}

function normalizeStudents(students, roomSize) {
  const slots = getRoomSlots(roomSize);
  const source = Array.isArray(students)
    ? Object.fromEntries(students.map((name, index) => [ROOM_SLOTS[index], name]))
    : (students || {});
  return Object.fromEntries(slots.map((slot) => [slot, source[slot] || null]));
}

function normalizePresence(presence, roomSize) {
  const slots = getRoomSlots(roomSize);
  const source = presence || {};
  return Object.fromEntries(slots.map((slot) => [slot, {
    online: !!source[slot]?.online,
    lastSeen: source[slot]?.lastSeen || null,
    ...(source[slot]?.readyForRound ? { readyForRound: source[slot].readyForRound } : {}),
  }]));
}

function normalizeStudentEmails(studentEmails, roomSize) {
  const slots = getRoomSlots(roomSize);
  const source = studentEmails || {};
  return Object.fromEntries(slots.map((slot) => [slot, source[slot] || null]));
}

function getStudentNames(students, roomSize) {
  return Object.values(normalizeStudents(students, roomSize)).filter(Boolean);
}

function findStudentSlot(students, studentName, roomSize) {
  const normalized = normalizeStudents(students, roomSize);
  return getRoomSlots(roomSize).find((slot) => normalized[slot] === studentName) || null;
}

function firstOpenSlot(students, roomSize) {
  const normalized = normalizeStudents(students, roomSize);
  return getRoomSlots(roomSize).find((slot) => !normalized[slot]) || null;
}

function normalizeRoom(room, session = {}) {
  if (!room) return room;
  const roomSize = normalizeRoomSize(room.roomSize || session.roomSize);
  room.roomSize = roomSize;
  room.students = normalizeStudents(room.students, roomSize);
  room.presence = normalizePresence(room.presence, roomSize);
  room.studentEmails = normalizeStudentEmails(room.studentEmails, roomSize);
  if (!Array.isArray(room.submissions)) room.submissions = [];
  if (!Array.isArray(room.aiFollowUps)) room.aiFollowUps = [];
  if (!Array.isArray(room.capabilityProfiles)) {
    room.capabilityProfiles = room.capabilityProfile ? [room.capabilityProfile] : [];
  }
  if (!Array.isArray(room.classifications)) room.classifications = [];
  if (!Array.isArray(room.nudges)) room.nudges = [];
  return room;
}

function rolesForRound(students, round, roomSize) {
  const names = getStudentNames(students, roomSize).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const size = normalizeRoomSize(roomSize);
  if (names.length < size) return null;

  const turn = ((round - 1) % size);
  if (size === 3) {
    return {
      asker: names[turn],
      answerer: names[(turn + 1) % size],
      noteTaker: names[(turn + 2) % size],
      interviewer: names[turn],
      storyteller: names[(turn + 1) % size],
    };
  }

  return {
    asker: names[turn],
    answerer: names[(turn + 1) % size],
    noteTaker: names[turn],
    interviewer: names[turn],
    storyteller: names[(turn + 1) % size],
  };
}

function totalRoundsForQuestions(questionCount, roomSize) {
  return Math.max(1, Number(questionCount) || 1) * normalizeRoomSize(roomSize);
}

module.exports = {
  ROOM_SLOTS,
  DEFAULT_ROOM_SIZE,
  normalizeRoomSize,
  getRoomSlots,
  normalizeStudents,
  normalizePresence,
  normalizeStudentEmails,
  getStudentNames,
  findStudentSlot,
  firstOpenSlot,
  normalizeRoom,
  rolesForRound,
  totalRoundsForQuestions,
};

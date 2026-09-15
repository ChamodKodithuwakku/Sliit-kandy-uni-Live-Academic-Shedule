// One classification rule for workbook sessions, overrides, and date exceptions.
export function getRoomType(room, config) {
  const key = String(room ?? '').replace(/\s+/g, '').toUpperCase();
  return config.ROOM_TYPE_MAPPING?.[key] === 'COMPUTER LAB' ? 'COMPUTER LAB' : 'LECTURE HALL';
}

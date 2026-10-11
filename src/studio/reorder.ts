export type Span = { top: number; bottom: number };

/** The gap a pointer at `y` points into: 0 is above the first row, `rows.length` below
 *  the last. A row's own half decides which side of it the gap is on. */
export function slotAt(rows: Span[], y: number): number {
  return rows.filter((r) => y > (r.top + r.bottom) / 2).length;
}

/** Where the row at `from` lands when dropped into gap `slot`, or null when that gap
 *  is either side of it and nothing would move. */
export function landingIndex(from: number, slot: number): number | null {
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}

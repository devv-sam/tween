import { easeKey } from "../core/easing";
import type { BlockView, KeyTarget } from "./modules";

/**
 * Elements running the same motion.
 *
 * Keying a whole selection gives every element picked its own curve — there is no
 * group in the composition and no shared curve to point at, because each element
 * really does animate on its own. What is true is narrower than that and worth
 * saying: several curves can be running in lockstep, and until one of them is
 * tweaked they are one gesture spread across several elements.
 *
 * That is read back off the composition rather than recorded when the keys are made.
 * Nothing has to be kept in step, no link can go stale, and tweaking one element's
 * curve breaks the link by simply making it a different curve — which is the whole
 * of "go in and change rect-1 on its own".
 */

/** Enough decimals to tell two authored times apart, few enough that arithmetic on
 *  the same number twice does not. */
const TIME_DP = 6;

const at = (t: number): string => t.toFixed(TIME_DP);

/**
 * A block's shape in time, with its values left out: what it animates, when it
 * starts and stops, where each stop falls inside it, and the easing carrying the
 * property into each one.
 *
 * Values are left out on purpose. Two elements sliding the same distance from
 * different places are doing one thing, and they are exactly what keying a selection
 * produces — calling them unrelated because they started apart would be reporting
 * the opposite of what happened.
 */
export function motionKey(block: BlockView): string {
  const stops = block.stops.map((s) => `${at(s.t)}${easeKey(s.ease)}`).join(",");
  const kind = block.standalone ? "keys" : `module:${block.label}`;
  return `${kind}/${block.prop}@${at(block.range[0])}..${at(block.range[1])}[${stops}]`;
}

/** One property, running the same way on more than one element. */
export type LinkGroup = {
  /** What its members have in common — the key every one of their blocks makes. */
  key: string;
  /** What is in lockstep. The rows say so in this property's own colour. */
  property: KeyTarget;
  /** The elements running it, in the order the timeline draws them. */
  members: string[];
};

export type LinkedRow = { id: string; blocks: BlockView[] };

/**
 * Which blocks across the composition are running the same motion, in the order the
 * first member of each is drawn. A property one element animates alone is not a
 * group: there is nothing to tie it to, and a link glyph on it would be noise.
 */
export function linkedMotion(rows: LinkedRow[]): LinkGroup[] {
  const groups = new Map<string, LinkGroup>();
  for (const row of rows) {
    for (const block of row.blocks) {
      const key = motionKey(block);
      const found = groups.get(key);
      if (found) found.members.push(row.id);
      else groups.set(key, { key, property: block.prop, members: [row.id] });
    }
  }
  return [...groups.values()].filter((g) => g.members.length > 1);
}

/**
 * The elements tied to each other by any group at all, gathered into families.
 *
 * Transitive, because the rail down the gutter can only say "these move together"
 * once: an element sharing its position with one neighbour and its rotation with
 * another belongs with both of them, and drawing that as two rails in one column
 * would mean drawing it as neither.
 *
 * Keyed by element, valued by the family's own key, so a row can ask what it is in
 * without searching. Elements in no family are absent.
 */
export function linkedFamilies(groups: LinkGroup[]): Map<string, string> {
  /** Each element's stand-in for the family it is in so far, resolved at the end. */
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let at = id;
    while (parent.get(at) !== undefined && parent.get(at) !== at) at = parent.get(at)!;
    return at;
  };
  for (const group of groups) {
    for (const id of group.members) if (!parent.has(id)) parent.set(id, id);
    const [first, ...rest] = group.members;
    for (const id of rest) {
      const a = root(first);
      const b = root(id);
      if (a !== b) parent.set(b, a);
    }
  }
  const out = new Map<string, string>();
  for (const id of parent.keys()) out.set(id, root(id));
  return out;
}

/** Where a row sits in the run of rows its family covers — which is what shapes the
 *  ends of the rail, so a family reads as one bracket and not a stack of dashes. */
export type RailCap = "top" | "middle" | "bottom" | "only";

/**
 * The rail down a column of rows: which of them carry it, and where it starts and
 * stops.
 *
 * Every row of an element in a family carries it, its open property rows included,
 * so the bracket runs unbroken past everything that belongs to it. A family whose
 * elements are not next to each other on the timeline is drawn as one bracket per
 * run — the rows between belong to something else, and a rail through them would
 * say they were part of this.
 */
export function railCaps(
  /** The rows the column draws, top to bottom. Several rows in a row may belong to
   *  one element; each of them is passed, in the order it is drawn. */
  rows: { id: string }[],
  families: Map<string, string>,
): (RailCap | null)[] {
  const familyAt = (i: number): string | undefined =>
    i >= 0 && i < rows.length ? families.get(rows[i].id) : undefined;
  return rows.map((row, i) => {
    const family = families.get(row.id);
    if (family === undefined) return null;
    const above = familyAt(i - 1) === family;
    const below = familyAt(i + 1) === family;
    if (above && below) return "middle";
    if (above) return "bottom";
    if (below) return "top";
    return "only";
  });
}

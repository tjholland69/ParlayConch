import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
type SortValue = string | number | null | undefined;
type SortState<K extends string> = { key: K; dir: SortDir } | null;

/**
 * Click-to-sort state for a table. Clicking a column sorts by it, clicking
 * it again flips the direction, and a third click goes back to the table's
 * default order: `initial` if given, otherwise the order the rows arrived in.
 * Empty values always sort last.
 */
export function useColumnSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => SortValue>,
  opts: { initial?: SortState<K>; firstDir?: SortDir } = {},
) {
  const { initial = null, firstDir = "asc" } = opts;
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    const flip = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * flip;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * flip;
    });
    // Accessors are a fresh object literal each render; the sort only needs
    // to rerun when the rows or the chosen column change.
  }, [rows, sort]);

  const toggle = (key: K) =>
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: firstDir };
      // Second click flips; the third restores the default order.
      if (cur.dir === firstDir) return { key, dir: firstDir === "asc" ? "desc" : "asc" };
      return initial;
    });

  return { sorted, sortKey: sort?.key ?? null, sortDir: sort?.dir ?? null, toggle };
}

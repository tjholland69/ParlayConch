import { useCallback, useMemo, useState } from "react";
import { useGridFilter, type CustomFilterProps } from "ag-grid-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const BLANK_LABEL = "(Blanks)";

/**
 * Community-edition stand-in for AG Grid Enterprise's Set Filter: a checkbox
 * list of the column's distinct values instead of a free-text condition.
 * `model` is either `null` (no restriction — every value selected) or the
 * array of currently-checked values; `doesFilterPass` treats blank/null
 * cell values as the synthetic "(Blanks)" bucket so they stay selectable.
 *
 * Only candidate values that currently pass every *other* active filter are
 * listed (via `doesRowPassOtherFilter`), matching the Excel-style behavior
 * users expect from a set filter — picking a value in one column narrows the
 * checkbox list shown for the others.
 */
export function CheckboxSetFilter<TData = any>({
  model,
  onModelChange,
  getValue,
  api,
  doesRowPassOtherFilter,
}: CustomFilterProps<TData, any, string[]>) {
  const [search, setSearch] = useState("");

  const availableValues = useMemo(() => {
    const values = new Set<string>();
    api.forEachNode((node) => {
      if (!doesRowPassOtherFilter(node)) return;
      const raw = getValue(node);
      values.add(raw == null || raw === "" ? BLANK_LABEL : String(raw));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [api, getValue, doesRowPassOtherFilter]);

  const selected = useMemo(() => new Set(model ?? availableValues), [model, availableValues]);

  const doesFilterPass = useCallback(
    ({ node }: { node: import("ag-grid-community").IRowNode<TData> }) => {
      if (model == null) return true;
      const raw = getValue(node);
      const value = raw == null || raw === "" ? BLANK_LABEL : String(raw);
      return model.includes(value);
    },
    [model, getValue],
  );

  useGridFilter({ doesFilterPass });

  const commit = (nextSelected: Set<string>) => {
    // Selecting everything is equivalent to no filter — report null so the
    // grid shows the column as unfiltered (matches Set Filter convention).
    onModelChange(nextSelected.size === availableValues.length ? null : Array.from(nextSelected));
  };

  const toggleValue = (value: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(value);
    else next.delete(value);
    commit(next);
  };

  const filteredValues = search.trim()
    ? availableValues.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()))
    : availableValues;

  const allFilteredSelected = filteredValues.length > 0 && filteredValues.every((v) => selected.has(v));

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selected);
    for (const v of filteredValues) {
      if (checked) next.add(v);
      else next.delete(v);
    }
    commit(next);
  };

  return (
    <div className="p-2 w-56 flex flex-col gap-2">
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
        autoFocus
      />
      <label className="flex items-center gap-2 px-1 py-1 text-sm font-medium cursor-pointer">
        <Checkbox checked={allFilteredSelected} onCheckedChange={(c) => toggleSelectAll(!!c)} />
        Select All
      </label>
      <ScrollArea className="h-48 border-t pt-1">
        <div className="flex flex-col gap-1 pr-2">
          {filteredValues.length === 0 && (
            <div className="text-sm text-muted-foreground px-1 py-1">No matches</div>
          )}
          {filteredValues.map((value) => (
            <label key={value} className="flex items-center gap-2 px-1 py-0.5 text-sm cursor-pointer">
              <Checkbox
                checked={selected.has(value)}
                onCheckedChange={(c) => toggleValue(value, !!c)}
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type CellContextMenuEvent,
  type AutoSizeStrategy,
  type GetRowIdParams,
  type SelectionChangedEvent,
  type RowSelectionOptions,
} from "ag-grid-community";
import type { FlatParlayLegRow } from "@/lib/flattenParlayLegs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Pencil, CloudDownload, Trash2, Copy, ClipboardCopy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

ModuleRegistry.registerModules([AllCommunityModule]);

// Follows the app's CSS custom properties so the grid matches the active
// light/dark theme (see :root / :root[data-theme="light"] in index.css)
// instead of carrying its own separate palette. Values must be wrapped in
// hsl(...) — the custom properties are bare "H S% L%" triplets, not valid
// CSS colors on their own, so passing them unwrapped silently produces
// transparent/invalid colors (this is why the grid's filter menus used to
// render with no visible backdrop).
const parlayConchGridTheme = themeQuartz.withParams({
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--foreground))",
  headerBackgroundColor: "hsl(var(--secondary))",
  headerTextColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  rowHoverColor: "hsl(var(--muted))",
  oddRowBackgroundColor: "hsl(var(--card))",
  chromeBackgroundColor: "hsl(var(--card))",
  fontFamily: "var(--font-body)",
});

// Bounds ("within reason") for the dynamic content-based auto-sizing below —
// each column can grow/shrink to fit its longest visible value, but never
// past these limits, so one long matchup name can't blow out the whole grid.
const columnDefs: ColDef<FlatParlayLegRow>[] = [
  { field: "parlayId", headerName: "Parlay #", minWidth: 90, maxWidth: 140, filter: "agNumberColumnFilter" },
  { field: "season", headerName: "Year", minWidth: 70, maxWidth: 100, filter: "agNumberColumnFilter" },
  { field: "weekLabel", headerName: "Week", minWidth: 90, maxWidth: 140, filter: "agTextColumnFilter" },
  { field: "member", headerName: "Member", minWidth: 100, maxWidth: 220, filter: "agTextColumnFilter" },
  { field: "legOwner", headerName: "Leg Owner", minWidth: 100, maxWidth: 220, filter: "agTextColumnFilter" },
  { field: "status", headerName: "Parlay Status", minWidth: 100, maxWidth: 160, filter: "agTextColumnFilter" },
  { field: "betType", headerName: "Bet Type", minWidth: 90, maxWidth: 140, filter: "agTextColumnFilter" },
  { field: "matchup", headerName: "Matchup / Player", minWidth: 160, maxWidth: 340, filter: "agTextColumnFilter" },
  { field: "pick", headerName: "Pick", minWidth: 120, maxWidth: 320, filter: "agTextColumnFilter" },
  { field: "line", headerName: "Line", minWidth: 70, maxWidth: 110, filter: "agTextColumnFilter" },
  { field: "odds", headerName: "Odds", minWidth: 70, maxWidth: 110, filter: "agTextColumnFilter" },
  { field: "oddsSource", headerName: "Book", minWidth: 90, maxWidth: 150, filter: "agTextColumnFilter" },
  { field: "result", headerName: "Result", minWidth: 80, maxWidth: 130, filter: "agTextColumnFilter" },
  {
    field: "gameTime",
    headerName: "Game Time",
    minWidth: 130,
    maxWidth: 190,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"),
  },
  { field: "slate", headerName: "Slate", minWidth: 90, maxWidth: 160, filter: "agTextColumnFilter" },
  {
    field: "decidedAt",
    headerName: "Settled At",
    minWidth: 140,
    maxWidth: 200,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"),
  },
];

const defaultColDef: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
};

// Row-based multi-select (checkbox column + ctrl/cmd-click + shift-click range)
// — this is Community-edition functionality. Cell *range* selection with
// native clipboard copy is Enterprise-only (not installed here, see the
// suppressContextMenu comment below), so multi-row copy/fetch is driven by
// our own context menu below instead.
const rowSelection: RowSelectionOptions<FlatParlayLegRow> = {
  mode: "multiRow",
  checkboxes: true,
  headerCheckbox: true,
  // Row click selects (ctrl/cmd-click toggles, shift-click range-selects),
  // same as the checkbox column — not just checkbox clicks.
  enableClickSelection: true,
};

// Auto-fits every column to its longest visible cell value on initial render
// and whenever the row data changes, bounded by each colDef's minWidth/maxWidth
// above ("within reason") instead of the fixed pixel widths used before.
const autoSizeStrategy: AutoSizeStrategy = { type: "fitCellContents" };

/** Row-level actions offered from the grid's right-click menu — only passed
 * in editable contexts (e.g. the Data Editor); read-only grid usages (League
 * Detail, History) omit this and get the plain browser context menu, same as
 * their read-only ParlayRollupCard tiles show no edit controls either. */
export type ParlayLegRowActions = {
  onEdit: (row: FlatParlayLegRow) => void;
  onFetch: (row: FlatParlayLegRow) => void;
  onDelete: (row: FlatParlayLegRow) => void;
};

function rowPickSummary(row: FlatParlayLegRow): string {
  // row.pick already has the line baked in (e.g. "Packers +6.5") — don't
  // append row.line too, or the line ends up printed twice.
  const parts = [row.matchup, row.pick, row.odds && row.odds !== "—" ? `(${row.odds})` : null].filter(Boolean);
  return parts.join(" ");
}

function rowAsText(row: FlatParlayLegRow): string {
  return [
    `Parlay #${row.parlayId}`,
    row.weekLabel,
    row.member,
    row.betType,
    rowPickSummary(row),
    row.oddsSource,
    row.result,
  ]
    .filter(Boolean)
    .join(" — ");
}

export function ParlayLegsGrid({ rows, rowActions }: { rows: FlatParlayLegRow[]; rowActions?: ParlayLegRowActions }) {
  const rowData = useMemo(() => rows, [rows]);
  const [contextRow, setContextRow] = useState<FlatParlayLegRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<FlatParlayLegRow[]>([]);
  const { toast } = useToast();

  const getRowId = (params: GetRowIdParams<FlatParlayLegRow>) => String(params.data.legId);

  const onSelectionChanged = (e: SelectionChangedEvent<FlatParlayLegRow>) => {
    setSelectedRows(e.api.getSelectedRows());
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied`, description: text.length > 200 ? `${text.slice(0, 200)}…` : text });
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" });
    }
  };

  // When right-clicking a row that's part of the current multi-selection,
  // the menu acts on the whole selection (standard file-manager/spreadsheet
  // behavior); right-clicking outside the selection acts on just that row.
  const effectiveRows = (() => {
    if (!contextRow) return [];
    if (selectedRows.length > 1 && selectedRows.some((r) => r.legId === contextRow.legId)) {
      return selectedRows;
    }
    return [contextRow];
  })();
  const isMultiSelection = effectiveRows.length > 1;

  const grid = (
    <div style={{ height: "70vh", width: "100%" }}>
      <AgGridReact<FlatParlayLegRow>
        theme={parlayConchGridTheme}
        rowData={rowData}
        getRowId={getRowId}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowSelection={rowSelection}
        onSelectionChanged={onSelectionChanged}
        autoSizeStrategy={autoSizeStrategy}
        animateRows
        pagination
        paginationPageSize={50}
        paginationPageSizeSelector={[25, 50, 100, 200]}
        // Without this, filter/column-menu popups mount inside the grid's own
        // root and get visually clipped/stacked under the app's fixed z-50
        // sidebar/topbar. Mounting at document.body (AG Grid's documented fix
        // for grids inside constrained layouts) plus the z-index override in
        // index.css keeps them above that chrome.
        popupParent={document.body}
        // AG Grid's own context menu is an Enterprise-only feature (not
        // installed here), so we suppress the browser's native menu and drive
        // our own via onCellContextMenu below — available on every usage of
        // this grid, not just editable ones (rowActions only adds extra items).
        suppressContextMenu
        onCellContextMenu={(e: CellContextMenuEvent<FlatParlayLegRow>) => setContextRow(e.data ?? null)}
      />
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{grid}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {effectiveRows.length > 0 && (
          <>
            <ContextMenuItem onSelect={() => copyToClipboard(effectiveRows.map(rowPickSummary).join("\n"), isMultiSelection ? `${effectiveRows.length} picks` : "Pick")}>
              <Copy className="w-3.5 h-3.5 mr-2" /> {isMultiSelection ? `Copy ${effectiveRows.length} picks` : "Copy pick"}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => copyToClipboard(effectiveRows.map(rowAsText).join("\n"), isMultiSelection ? `${effectiveRows.length} rows` : "Row")}>
              <ClipboardCopy className="w-3.5 h-3.5 mr-2" /> {isMultiSelection ? `Copy ${effectiveRows.length} rows as text` : "Copy row as text"}
            </ContextMenuItem>
            {rowActions && (
              <>
                <ContextMenuSeparator />
                {isMultiSelection ? (
                  <ContextMenuItem onSelect={() => effectiveRows.forEach((row) => rowActions.onFetch(row))}>
                    <CloudDownload className="w-3.5 h-3.5 mr-2" /> Fetch historical data for {effectiveRows.length} legs
                  </ContextMenuItem>
                ) : (
                  <>
                    <ContextMenuItem onSelect={() => rowActions.onEdit(effectiveRows[0])}>
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit leg
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => rowActions.onFetch(effectiveRows[0])}>
                      <CloudDownload className="w-3.5 h-3.5 mr-2" /> Fetch historical data
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => rowActions.onDelete(effectiveRows[0])}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete leg
                    </ContextMenuItem>
                  </>
                )}
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
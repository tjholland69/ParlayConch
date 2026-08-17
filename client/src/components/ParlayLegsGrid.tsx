import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, themeQuartz, type ColDef, type CellContextMenuEvent } from "ag-grid-community";
import type { FlatParlayLegRow } from "@/lib/flattenParlayLegs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Pencil, CloudDownload, Trash2 } from "lucide-react";

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

const columnDefs: ColDef<FlatParlayLegRow>[] = [
  { field: "parlayId", headerName: "Parlay #", width: 110, filter: "agNumberColumnFilter" },
  { field: "season", headerName: "Year", width: 90, filter: "agNumberColumnFilter" },
  { field: "weekLabel", headerName: "Week", width: 110, filter: "agTextColumnFilter" },
  { field: "member", headerName: "Member", width: 140, filter: "agTextColumnFilter" },
  { field: "legOwner", headerName: "Leg Owner", width: 140, filter: "agTextColumnFilter" },
  { field: "status", headerName: "Parlay Status", width: 130, filter: "agTextColumnFilter" },
  { field: "betType", headerName: "Bet Type", width: 110, filter: "agTextColumnFilter" },
  { field: "matchup", headerName: "Matchup / Player", flex: 1, minWidth: 180, filter: "agTextColumnFilter" },
  { field: "pick", headerName: "Pick", flex: 1, minWidth: 160, filter: "agTextColumnFilter" },
  { field: "line", headerName: "Line", width: 90, filter: "agTextColumnFilter" },
  { field: "odds", headerName: "Odds", width: 90, filter: "agTextColumnFilter" },
  { field: "oddsSource", headerName: "Book", width: 110, filter: "agTextColumnFilter" },
  { field: "result", headerName: "Result", width: 100, filter: "agTextColumnFilter" },
  {
    field: "gameTime",
    headerName: "Game Time",
    width: 150,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"),
  },
  { field: "slate", headerName: "Slate", width: 120, filter: "agTextColumnFilter" },
  {
    field: "decidedAt",
    headerName: "Settled At",
    width: 160,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"),
  },
];

const defaultColDef: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
};

/** Row-level actions offered from the grid's right-click menu — only passed
 * in editable contexts (e.g. the Data Editor); read-only grid usages (League
 * Detail, History) omit this and get the plain browser context menu, same as
 * their read-only ParlayRollupCard tiles show no edit controls either. */
export type ParlayLegRowActions = {
  onEdit: (row: FlatParlayLegRow) => void;
  onFetch: (row: FlatParlayLegRow) => void;
  onDelete: (row: FlatParlayLegRow) => void;
};

export function ParlayLegsGrid({ rows, rowActions }: { rows: FlatParlayLegRow[]; rowActions?: ParlayLegRowActions }) {
  const rowData = useMemo(() => rows, [rows]);
  const [contextRow, setContextRow] = useState<FlatParlayLegRow | null>(null);

  const grid = (
    <div style={{ height: "70vh", width: "100%" }}>
      <AgGridReact<FlatParlayLegRow>
        theme={parlayConchGridTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
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
        // installed here) — suppressing it just stops AG Grid from getting in
        // the way; the browser's native menu still shows unless we're driving
        // our own (rowActions below).
        suppressContextMenu={!!rowActions}
        onCellContextMenu={rowActions ? (e: CellContextMenuEvent<FlatParlayLegRow>) => setContextRow(e.data ?? null) : undefined}
      />
    </div>
  );

  if (!rowActions) return grid;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{grid}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {contextRow && (
          <>
            <ContextMenuItem onSelect={() => rowActions.onEdit(contextRow)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit leg
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => rowActions.onFetch(contextRow)}>
              <CloudDownload className="w-3.5 h-3.5 mr-2" /> Fetch historical data
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => rowActions.onDelete(contextRow)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete leg
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
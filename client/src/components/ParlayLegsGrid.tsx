import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, themeQuartz, type ColDef } from "ag-grid-community";
import type { FlatParlayLegRow } from "@/lib/flattenParlayLegs";

ModuleRegistry.registerModules([AllCommunityModule]);

// Follows the app's CSS custom properties so the grid matches the active
// light/dark theme (see :root / :root[data-theme="light"] in index.css)
// instead of carrying its own separate palette.
const parlayConchGridTheme = themeQuartz.withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--secondary)",
  headerTextColor: "var(--foreground)",
  borderColor: "var(--border)",
  rowHoverColor: "var(--muted)",
  oddRowBackgroundColor: "var(--card)",
  chromeBackgroundColor: "var(--card)",
  fontFamily: "var(--font-body)",
});

const columnDefs: ColDef<FlatParlayLegRow>[] = [
  { field: "parlayId", headerName: "Parlay #", width: 110, filter: "agNumberColumnFilter" },
  { field: "season", headerName: "Year", width: 90, filter: "agNumberColumnFilter" },
  { field: "weekLabel", headerName: "Week", width: 110, filter: "agSetColumnFilter" },
  { field: "member", headerName: "Member", width: 140, filter: "agSetColumnFilter" },
  { field: "legOwner", headerName: "Leg Owner", width: 140, filter: "agSetColumnFilter" },
  { field: "status", headerName: "Parlay Status", width: 130, filter: "agSetColumnFilter" },
  { field: "betType", headerName: "Bet Type", width: 110, filter: "agSetColumnFilter" },
  { field: "matchup", headerName: "Matchup / Player", flex: 1, minWidth: 180, filter: "agTextColumnFilter" },
  { field: "pick", headerName: "Pick", flex: 1, minWidth: 160, filter: "agTextColumnFilter" },
  { field: "line", headerName: "Line", width: 90, filter: "agTextColumnFilter" },
  { field: "odds", headerName: "Odds", width: 90, filter: "agTextColumnFilter" },
  { field: "oddsSource", headerName: "Book", width: 110, filter: "agSetColumnFilter" },
  { field: "result", headerName: "Result", width: 100, filter: "agSetColumnFilter" },
  {
    field: "gameTime",
    headerName: "Game Time",
    width: 150,
    filter: "agDateColumnFilter",
    valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"),
  },
];

const defaultColDef: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
};

export function ParlayLegsGrid({ rows }: { rows: FlatParlayLegRow[] }) {
  const rowData = useMemo(() => rows, [rows]);

  return (
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
      />
    </div>
  );
}
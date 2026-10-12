import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Search, UserCog } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatPhone, PHONE_HINT } from "@shared/phone";

type AdminUserRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  isDemo: boolean;
  isSuperUser: boolean;
  createdAt: string | null;
};

type AdminUserDetail = AdminUserRow & {
  phoneNumber: string | null;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  leagues: { leagueId: number; name: string; role: string | null; isActive: boolean; isDemo: boolean | null }[];
};

const nameOf = (u: AdminUserRow) => u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;

const ROLE_LABELS: Record<string, string> = { admin: "Parlay Maestro", lieutenant: "Parlay Lieutenant", member: "Member" };

/** Waits for typing to pause before searching. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * The super user's support desk: find any account, then fix its name, email
 * or mobile number, flag it as demo, or set a new password, without writing
 * SQL. The server checks super user access on every call and records each
 * change in the audit log.
 */
export function UserManager() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 250);

  const { data: results, isLoading, isError } = useQuery<AdminUserRow[]>({
    queryKey: ["/api/admin/users", q],
    queryFn: async () => (await apiRequest("GET", `/api/admin/users?q=${encodeURIComponent(q)}`)).json(),
  });

  return (
    <Card className="border-white/5" data-testid="card-user-manager">
      <CardHeader className="pb-2 font-semibold text-sm flex-row items-center gap-2 space-y-0">
        <UserCog className="w-4 h-4 text-accent" />
        User Manager
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Look up any account to correct its details or reset its password. Every change is recorded in the audit log.
        </p>
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-2 min-w-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                className="pl-8"
                autoComplete="off"
                aria-label="Search users by name or email"
                data-testid="input-user-search"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {q ? "Matches, up to 50." : "Newest accounts first. Type to search everyone."}
            </p>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
              {isLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : isError ? (
                <p className="p-3 text-xs text-red-400">Couldn't load users.</p>
              ) : !results?.length ? (
                <p className="p-3 text-xs text-muted-foreground">No account matches "{q}".</p>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className={cn(
                      "block w-full px-3 py-2 text-left transition-colors hover:bg-white/5",
                      selectedId === u.id && "bg-primary/10",
                    )}
                    aria-pressed={selectedId === u.id}
                    data-testid={`row-user-${u.id}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{nameOf(u)}</span>
                      {u.isSuperUser && <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">SUPER</Badge>}
                      {u.isDemo && <Badge variant="outline" className="shrink-0 border-yellow-500/40 px-1 py-0 text-[10px] text-yellow-400">DEMO</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email ?? "No email"}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="min-w-0">
            {selectedId ? (
              <UserEditor key={selectedId} userId={selectedId} />
            ) : (
              <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                Pick an account on the left to see and edit it.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserEditor({ userId }: { userId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useQuery<AdminUserDetail>({
    queryKey: ["/api/admin/users", "detail", userId],
    queryFn: async () => (await apiRequest("GET", `/api/admin/users/${userId}`)).json(),
  });

  const [form, setForm] = useState({ firstName: "", lastName: "", displayName: "", email: "", phoneNumber: "", isDemo: false });
  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      phoneNumber: formatPhone(user.phoneNumber),
      isDemo: user.isDemo,
    });
  }, [user]);

  const save = useMutation({
    mutationFn: async (): Promise<{ changed: string[]; user: AdminUserDetail }> =>
      (await apiRequest("PATCH", `/api/admin/users/${userId}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        displayName: form.displayName,
        email: form.email,
        phoneNumber: form.phoneNumber,
        isDemo: form.isDemo,
      })).json(),
    onSuccess: ({ changed, user: saved }) => {
      queryClient.setQueryData(["/api/admin/users", "detail", userId], saved);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: changed.length ? "Account updated" : "Nothing to change", description: changed.length ? `Changed: ${changed.join(", ")}.` : undefined });
    },
    onError: (err: Error) => toast({ title: "Couldn't save the changes", description: err.message, variant: "destructive" }),
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;
  const reset = useMutation({
    mutationFn: async (): Promise<{ message: string }> =>
      (await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { password })).json(),
    onSuccess: (data) => {
      toast({ title: "Password reset", description: data.message });
      setPassword("");
      setConfirm("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", "detail", userId] });
    },
    onError: (err: Error) => toast({ title: "Couldn't reset the password", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (isError || !user) return <p className="text-sm text-red-400">Couldn't load this account.</p>;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key: "firstName" | "lastName" | "displayName" | "email" | "phoneNumber", label: string, extra?: React.ComponentProps<typeof Input>) => (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={`user-${key}`} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={`user-${key}`} value={form[key]} onChange={set(key)} autoComplete="off" data-testid={`input-user-${key}`} {...extra} />
    </div>
  );

  return (
    <div className="space-y-5" data-testid={`panel-user-${user.id}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {field("firstName", "First name")}
          {field("lastName", "Last name")}
          {field("displayName", "Display name")}
          {field("email", "Email (their sign-in)", { type: "email" })}
          {field("phoneNumber", "Mobile number", { type: "tel", placeholder: "(508) 555-1234" })}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor="user-demo" className="text-sm">Demo / QA account</Label>
              <p className="text-[11px] text-muted-foreground">Shows a DEMO badge by their name.</p>
            </div>
            <Switch id="user-demo" checked={form.isDemo} onCheckedChange={(isDemo) => setForm((f) => ({ ...f, isDemo }))} data-testid="switch-user-is-demo" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Mobile number: {PHONE_HINT} Changing the email changes what they sign in with.</p>
        <Button type="submit" size="sm" disabled={save.isPending} data-testid="button-save-user">
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </form>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">User ID</dt>
        <dd className="truncate font-mono">{user.id}</dd>
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd>{user.hasPassword ? `Set${user.passwordUpdatedAt ? `, last changed ${new Date(user.passwordUpdatedAt).toLocaleDateString()}` : ""}` : "None yet"}</dd>
        <dt className="text-muted-foreground">Super user</dt>
        <dd>{user.isSuperUser ? "Yes" : "No"}</dd>
        <dt className="text-muted-foreground">Leagues</dt>
        <dd>
          {user.leagues.length === 0
            ? "None"
            : user.leagues.map((l) => `${l.name} (${ROLE_LABELS[l.role ?? "member"] ?? l.role}${l.isActive ? "" : ", left"})`).join(" · ")}
        </dd>
      </dl>

      <form
        className="space-y-3 border-t border-white/5 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length >= 8 && confirm === password) reset.mutate();
        }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-accent" />Reset password</p>
        <p className="text-xs text-muted-foreground">
          Sets a new password right away. They aren't emailed, so tell them the new password yourself.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="reset-password" className="text-xs text-muted-foreground">New password (8+ characters)</Label>
            <Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-reset-password" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reset-confirm" className="text-xs text-muted-foreground">Confirm new password</Label>
            <Input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} data-testid="input-reset-confirm" />
          </div>
        </div>
        {mismatch && <p className="text-xs text-red-400">The two passwords don't match.</p>}
        <Button type="submit" size="sm" variant="outline" disabled={password.length < 8 || confirm !== password || reset.isPending} data-testid="button-reset-password">
          {reset.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />}
          Reset password
        </Button>
      </form>
    </div>
  );
}

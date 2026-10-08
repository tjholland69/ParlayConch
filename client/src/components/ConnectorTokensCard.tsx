import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import type { ApiTokenSummary } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Check, Copy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TOKENS_KEY = ["/api/users/me/api-tokens"];

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Something went wrong");
  }
  return res.json();
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0 gap-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast({ title: "Couldn't copy", description: "Your browser blocked clipboard access.", variant: "destructive" });
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
      {label}
    </Button>
  );
}

/**
 * Settings > Account: access tokens for the read-only AI connector (the MCP
 * server at /mcp). A new token is shown once, with what to paste where;
 * after that only its first characters are kept, to tell tokens apart.
 */
export function ConnectorTokensCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const serverUrl = `${window.location.origin}/mcp`;

  const { data: tokens = [] } = useQuery<ApiTokenSummary[]>({
    queryKey: TOKENS_KEY,
    queryFn: () => send(TOKENS_KEY[0], "GET"),
  });

  const create = useMutation({
    mutationFn: (tokenName: string) => send(TOKENS_KEY[0], "POST", { name: tokenName }) as Promise<{ token: string; summary: ApiTokenSummary }>,
    onSuccess: (data) => {
      setCreated({ token: data.token, name: data.summary.name });
      setName("");
      queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
    onError: (e: Error) => toast({ title: "Couldn't create the token", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => send(`${TOKENS_KEY[0]}/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      toast({ title: "Token revoked", description: "Anything using it has lost access." });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke the token", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="bg-card/50 border-white/5" data-testid="card-connector-tokens">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Assistant Access
        </CardTitle>
        <CardDescription>
          Let an AI assistant that supports MCP connectors read your leagues: standings, reports, this week's parlay and bet history. It can only read, and only the leagues you're in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {created && (
          <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="panel-new-token">
            <p className="text-sm font-semibold">"{created.name}" is ready. Copy the token now: it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-3 py-2 text-xs" data-testid="text-new-token">{created.token}</code>
              <CopyButton value={created.token} label="Copy token" />
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>In your assistant, add a custom MCP server (HTTP) with:</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-background px-3 py-2 text-foreground">{serverUrl}</code>
                <CopyButton value={serverUrl} label="Copy URL" />
              </div>
              <p>and this header: <code className="text-foreground">Authorization: Bearer &lt;your token&gt;</code></p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)} data-testid="button-dismiss-new-token">Done, I've saved it</Button>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3" data-testid={`row-token-${t.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <code>{t.tokenPrefix}…</code> · created {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })} ·{" "}
                    {t.lastUsedAt ? `last used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}` : "never used"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 gap-1.5 text-destructive hover:text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(t.id)}
                  data-testid={`button-revoke-token-${t.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
        >
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="token-name" className="text-xs text-muted-foreground">New token: what will use it?</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude on my laptop"
              maxLength={60}
              className="bg-background border-white/10"
              data-testid="input-token-name"
            />
          </div>
          <Button type="submit" disabled={!name.trim() || create.isPending} data-testid="button-create-token">
            {create.isPending ? "Creating…" : "Create token"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Treat a token like a password. Use one per assistant, and revoke any you stop using.
        </p>
      </CardContent>
    </Card>
  );
}

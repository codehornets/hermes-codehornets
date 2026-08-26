import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Activity,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { api } from "@/lib/api";
import type { DashboardActivityEvent, SessionInfo } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  PageIntro,
  SectionHeading,
} from "@/components/operations/OperationsUi";

const FRIENDLY_PATHS: Array<[RegExp, string]> = [
  [/^\/api\/projects/, "Project registry changed"],
  [/^\/api\/plugins\/kanban/, "Kanban board changed"],
  [/^\/api\/profiles/, "Profile changed"],
  [/^\/api\/skills/, "Skill configuration changed"],
  [/^\/api\/dashboard\/agent-plugins/, "Plugin installation changed"],
  [/^\/api\/env/, "Credential configuration changed"],
  [/^\/api\/config/, "Hermes configuration changed"],
  [/^\/api\/cron/, "Automation changed"],
  [/^\/api\/pairing/, "Pairing access changed"],
  [/^\/api\/memory/, "Memory configuration changed"],
  [/^\/api\/gateway/, "Gateway lifecycle action"],
  [/^\/api\/hermes\/update/, "Hermes update action"],
];

function eventTitle(event: DashboardActivityEvent): string {
  return (
    FRIENDLY_PATHS.find(([pattern]) => pattern.test(event.path))?.[1] ??
    "Dashboard action"
  );
}

function formatTime(epoch: number): string {
  if (!epoch) return "Unknown time";
  return new Date(epoch * 1000).toLocaleString();
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<DashboardActivityEvent[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [activity, recent] = await Promise.all([
      api.getDashboardActivity(250),
      api
        .getSessions(12, 0, { order: "recent" })
        .catch(() => ({ sessions: [], total: 0, limit: 12, offset: 0 })),
    ]);
    setEvents(activity.events);
    setSessions(recent.sessions);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setLoading(false)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(event =>
      [
        eventTitle(event),
        event.path,
        event.method,
        event.profile,
        event.status,
      ].some(value => String(value).toLowerCase().includes(needle)),
    );
  }, [events, query]);

  if (loading && events.length === 0)
    return <LoadingState label="Loading activity trail…" />;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Activity and audit trail"
        description="A payload-free record of dashboard mutations alongside recent agent sessions. Secrets and request bodies are never retained."
        actions={
          <Button
            ghost
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            prefix={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        }
      />

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Filter path, profile, method, or action…"
          className="pl-9"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Dashboard changes"
            description="Append-only metadata for POST, PUT, PATCH, and DELETE requests. Records begin after this feature is installed."
          />
          {filtered.length === 0 ? (
            <EmptyState
              positive
              title="No matching changes"
              description="No dashboard mutations match this filter. Read-only browsing is intentionally not logged."
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {filtered.map((event, index) => (
                  <div
                    key={`${event.epoch}:${event.path}:${index}`}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {eventTitle(event)}
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {event.method} {event.path}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatTime(event.epoch)} · profile {event.profile}
                      </div>
                    </div>
                    <Badge
                      tone={event.status >= 400 ? "destructive" : "success"}
                    >
                      {event.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Recent agent sessions"
            description="Latest profile-scoped execution activity."
          />
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {sessions.map(session => (
                <Link
                  key={session.id}
                  to={`/chat?resume=${encodeURIComponent(session.id)}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                >
                  <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {session.title || session.preview || session.id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {session.source || "cli"} ·{" "}
                      {session.model || "unknown model"}
                    </div>
                  </div>
                  {session.is_active && <Badge tone="success">active</Badge>}
                </Link>
              ))}
              {sessions.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  No recent sessions.
                </div>
              )}
            </CardContent>
          </Card>
          <Button
            outlined
            size="sm"
            onClick={() => navigate("/logs")}
            prefix={<FileText className="h-4 w-4" />}
          >
            Open raw logs
          </Button>
        </section>
      </div>
    </div>
  );
}

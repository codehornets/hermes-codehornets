import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  Inbox,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type {
  CronJob,
  KanbanBoardResponse,
  KanbanDiagnosticsResponse,
  KanbanWorkersResponse,
  PairingResponse,
  ProfileInfo,
  StatusResponse,
} from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageIntro,
  SectionHeading,
} from "@/components/operations/OperationsUi";

interface OverviewData {
  status: StatusResponse | null;
  profiles: ProfileInfo[];
  cron: CronJob[];
  pairing: PairingResponse;
  board: KanbanBoardResponse | null;
  workers: KanbanWorkersResponse;
  diagnostics: KanbanDiagnosticsResponse;
}

const EMPTY_PAIRING: PairingResponse = { pending: [], approved: [] };
const EMPTY_WORKERS: KanbanWorkersResponse = {
  workers: [],
  count: 0,
  checked_at: 0,
};
const EMPTY_DIAGNOSTICS: KanbanDiagnosticsResponse = {
  diagnostics: [],
  count: 0,
};

function taskCount(
  board: KanbanBoardResponse | null,
  statuses: string[],
): number {
  if (!board) return 0;
  return board.columns
    .filter(column => statuses.includes(column.name))
    .reduce((sum, column) => sum + column.tasks.length, 0);
}

function formatWhen(value?: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [status, profiles, cron, pairing, board, workers, diagnostics] =
      await Promise.all([
        api.getStatus().catch(() => null),
        api
          .getProfiles()
          .then(result => result.profiles)
          .catch(() => []),
        api.getCronJobs("all").catch(() => []),
        api.getPairing().catch(() => EMPTY_PAIRING),
        api.getKanbanBoard().catch(() => null),
        api.getKanbanActiveWorkers().catch(() => EMPTY_WORKERS),
        api.getKanbanDiagnostics().catch(() => EMPTY_DIAGNOSTICS),
      ]);
    setData({ status, profiles, cron, pairing, board, workers, diagnostics });
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading && !data)
    return <LoadingState label="Loading operations overview…" />;

  const value = data!;
  const reviewTasks = taskCount(value.board, ["review"]);
  const blockedTasks = taskCount(value.board, ["blocked"]);
  const readyTasks = taskCount(value.board, ["ready"]);
  const cronFailures = value.cron.filter(
    job =>
      job.last_status === "failed" || job.last_error || job.last_fire_error,
  );
  const attention =
    value.pairing.pending.length +
    reviewTasks +
    blockedTasks +
    cronFailures.length +
    value.diagnostics.count;
  const nextCron = value.cron
    .filter(job => job.enabled && job.next_run_at)
    .sort((a, b) =>
      String(a.next_run_at).localeCompare(String(b.next_run_at)),
    )[0];

  const attentionItems = [
    value.pairing.pending.length
      ? {
          label: `${value.pairing.pending.length} pairing request(s)`,
          href: "/pairing",
          tone: "warning" as const,
        }
      : null,
    reviewTasks
      ? {
          label: `${reviewTasks} task(s) waiting for review`,
          href: "/kanban",
          tone: "warning" as const,
        }
      : null,
    blockedTasks
      ? {
          label: `${blockedTasks} blocked task(s)`,
          href: "/kanban",
          tone: "destructive" as const,
        }
      : null,
    cronFailures.length
      ? {
          label: `${cronFailures.length} cron failure(s)`,
          href: "/cron",
          tone: "destructive" as const,
        }
      : null,
    value.diagnostics.count
      ? {
          label: `${value.diagnostics.count} board diagnostic(s)`,
          href: "/kanban",
          tone: "destructive" as const,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Operations at a glance"
        description="Live gateway, agent fleet, task, automation, and human-attention signals in one place."
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Gateway"
          value={value.status?.gateway_running ? "Running" : "Stopped"}
          detail={`${value.status?.active_sessions ?? 0} active session(s)`}
          tone={value.status?.gateway_running ? "success" : "danger"}
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricCard
          label="Active agents"
          value={value.workers.count}
          detail={`${value.profiles.length} configured profile(s)`}
          tone={value.workers.count ? "success" : "neutral"}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Task queue"
          value={readyTasks}
          detail={`${reviewTasks} review · ${blockedTasks} blocked`}
          tone={blockedTasks ? "warning" : "neutral"}
          icon={<LayoutDashboard className="h-5 w-5" />}
        />
        <MetricCard
          label="Needs attention"
          value={attention}
          detail={
            attention ? "Open the inbox to triage" : "Everything looks clear"
          }
          tone={attention ? "warning" : "success"}
          icon={<Inbox className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Needs attention"
            description="Failures, reviews, approvals, and drift that need a person."
            action={
              <Button outlined size="sm" onClick={() => navigate("/inbox")}>
                Open inbox
              </Button>
            }
          />
          {attentionItems.length === 0 ? (
            <EmptyState
              positive
              title="Inbox clear"
              description="No failed automations, blocked tasks, pending reviews, pairing requests, or board diagnostics."
            />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {attentionItems.map(item => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      {item.label}
                    </span>
                    <Badge tone={item.tone}>
                      {item.tone === "warning" ? "review" : "action"}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Next automation"
            description="The next enabled scheduled job across profiles."
          />
          <Card>
            <CardContent className="p-4">
              {nextCron ? (
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {nextCron.name || nextCron.id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatWhen(nextCron.next_run_at)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Profile:{" "}
                      {nextCron.profile_name || nextCron.profile || "default"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No enabled cron job is currently scheduled.
                </div>
              )}
              <Button
                outlined
                size="sm"
                className="mt-4"
                onClick={() => navigate("/cron")}
              >
                Manage automation
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Quick actions"
          description="Jump directly to the main human-control surfaces."
        />
        <div className="flex flex-wrap gap-2">
          <Button outlined onClick={() => navigate("/kanban")}>
            Open Kanban
          </Button>
          <Button outlined onClick={() => navigate("/fleet")}>
            Inspect fleet
          </Button>
          <Button outlined onClick={() => navigate("/projects")}>
            Manage projects
          </Button>
          <Button outlined onClick={() => navigate("/activity")}>
            View activity
          </Button>
        </div>
      </section>
    </div>
  );
}

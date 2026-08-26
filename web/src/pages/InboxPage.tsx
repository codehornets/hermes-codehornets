import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type { CronJob, KanbanTaskSummary, PairingUser } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  PageIntro,
  SectionHeading,
} from "@/components/operations/OperationsUi";

interface InboxData {
  pairing: PairingUser[];
  tasks: KanbanTaskSummary[];
  cron: CronJob[];
  diagnostics: Array<{
    task_id: string;
    task_title: string | null;
    task_status: string | null;
    diagnostics: Array<{ severity?: string; code?: string; message?: string }>;
  }>;
}

function ItemRow({
  icon,
  title,
  detail,
  href,
  badge,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  badge: string;
  tone: "warning" | "destructive" | "secondary";
}) {
  return (
    <Link
      to={href}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {detail}
        </div>
      </div>
      <Badge tone={tone}>{badge}</Badge>
    </Link>
  );
}

export default function InboxPage() {
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pairing, board, cron, diagnostics] = await Promise.all([
      api
        .getPairing()
        .then(value => value.pending)
        .catch(() => []),
      api.getKanbanBoard().catch(() => null),
      api.getCronJobs("all").catch(() => []),
      api
        .getKanbanDiagnostics()
        .then(value => value.diagnostics)
        .catch(() => []),
    ]);
    const tasks = board
      ? board.columns
          .filter(
            column => column.name === "blocked" || column.name === "review",
          )
          .flatMap(column => column.tasks)
      : [];
    setData({ pairing, tasks, cron, diagnostics });
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const failures = useMemo(
    () =>
      (data?.cron ?? []).filter(
        job =>
          job.last_status === "failed" ||
          job.last_error ||
          job.last_fire_error ||
          job.last_delivery_error,
      ),
    [data],
  );

  if (loading && !data)
    return <LoadingState label="Collecting attention items…" />;
  const count =
    data!.pairing.length +
    data!.tasks.length +
    failures.length +
    data!.diagnostics.length;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Human inbox"
        description="One queue for approvals, reviews, blocked work, automation failures, and operational diagnostics."
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

      {count === 0 ? (
        <EmptyState
          positive
          title="Nothing needs your attention"
          description="Hermes found no pairing requests, task reviews, blocked tasks, failed automations, or board diagnostics."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data!.pairing.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Access requests"
                description="Users waiting for gateway pairing approval."
              />
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {data!.pairing.map(user => (
                    <ItemRow
                      key={`${user.platform}:${user.user_id}`}
                      icon={<ShieldCheck className="h-4 w-4" />}
                      title={user.user_name || user.user_id}
                      detail={`${user.platform} · ${user.age_minutes ?? 0} minutes ago`}
                      href="/pairing"
                      badge="approve"
                      tone="warning"
                    />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {data!.tasks.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Task decisions"
                description="Reviews and blocked cards that need a human decision."
              />
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {data!.tasks.map(task => (
                    <ItemRow
                      key={task.id}
                      icon={<Inbox className="h-4 w-4" />}
                      title={task.title}
                      detail={`${task.assignee || "unassigned"} · ${task.id}`}
                      href="/kanban"
                      badge={task.status}
                      tone={
                        task.status === "blocked" ? "destructive" : "warning"
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {failures.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Automation failures"
                description="Scheduled jobs whose latest run or delivery failed."
              />
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {failures.map(job => (
                    <ItemRow
                      key={`${job.profile || "default"}:${job.id}`}
                      icon={<Clock className="h-4 w-4" />}
                      title={job.name || job.id}
                      detail={
                        job.last_error ||
                        job.last_delivery_error ||
                        job.last_fire_error?.detail ||
                        "Latest run failed"
                      }
                      href="/cron"
                      badge="failed"
                      tone="destructive"
                    />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {data!.diagnostics.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Board diagnostics"
                description="Drift, liveness, and task-protocol warnings detected by Kanban."
              />
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {data!.diagnostics.map(item => (
                    <ItemRow
                      key={item.task_id}
                      icon={<AlertTriangle className="h-4 w-4" />}
                      title={item.task_title || item.task_id}
                      detail={
                        item.diagnostics
                          .map(
                            diagnostic => diagnostic.message || diagnostic.code,
                          )
                          .filter(Boolean)
                          .join(" · ") || "Board diagnostic"
                      }
                      href="/kanban"
                      badge="inspect"
                      tone="destructive"
                    />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4" />
        Opening an item takes you to its owning surface; the inbox does not
        duplicate mutation controls.
      </div>
    </div>
  );
}

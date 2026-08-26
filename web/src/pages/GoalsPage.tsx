import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  CirclePause,
  Flag,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type { GoalInfo } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageIntro,
} from "@/components/operations/OperationsUi";

const STATUS_TONE: Record<
  GoalInfo["status"],
  "success" | "warning" | "secondary" | "outline"
> = {
  active: "success",
  paused: "warning",
  done: "secondary",
  cleared: "outline",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.getGoals();
    setGoals(result.goals);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch(() => setLoading(false)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? goals
        : goals.filter(
            goal => goal.status === "active" || goal.status === "paused",
          ),
    [filter, goals],
  );
  const active = goals.filter(goal => goal.status === "active").length;
  const waiting = goals.filter(goal => goal.waiting_reason).length;
  const paused = goals.filter(goal => goal.status === "paused").length;

  const act = async (goal: GoalInfo, action: "pause" | "resume" | "clear") => {
    setBusy(`${goal.session_id}:${action}`);
    try {
      const result = await api.mutateGoal(goal.session_id, action);
      setGoals(result.goals);
    } finally {
      setBusy(null);
    }
  };

  if (loading && goals.length === 0)
    return <LoadingState label="Loading durable goals…" />;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Durable goals and workflows"
        description="Track session goal loops, completion contracts, subgoals, quality gates, wait barriers, and remaining turn budgets."
        actions={
          <>
            <Button
              ghost
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              prefix={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Button
              outlined
              size="sm"
              onClick={() =>
                setFilter(value => (value === "open" ? "all" : "open"))
              }
            >
              {filter === "open" ? "Show history" : "Show open"}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active"
          value={active}
          detail="Currently evaluating after turns"
          tone={active ? "success" : "neutral"}
          icon={<Flag className="h-5 w-5" />}
        />
        <MetricCard
          label="Waiting"
          value={waiting}
          detail="Parked on time or background work"
          tone={waiting ? "warning" : "neutral"}
        />
        <MetricCard
          label="Paused"
          value={paused}
          detail="Requires an explicit resume"
          tone={paused ? "warning" : "neutral"}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          positive={goals.length > 0}
          title={goals.length ? "No open goals" : "No durable goals yet"}
          description={
            goals.length
              ? "All recorded goals are completed or cleared. Show history to inspect them."
              : "Start one inside a chat with /goal <objective>. It will appear here with its turn budget and verification state."
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map(goal => {
            const progress = Math.min(
              100,
              Math.round((goal.turns_used / Math.max(goal.max_turns, 1)) * 100),
            );
            return (
              <Card key={goal.session_id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATUS_TONE[goal.status]}>
                          {goal.status}
                        </Badge>
                        {goal.waiting_reason && (
                          <Badge tone="warning">waiting</Badge>
                        )}
                        {goal.gates.length > 0 && (
                          <Badge tone="outline">
                            {goal.gates.length} gate(s)
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-6 text-foreground">
                        {goal.goal}
                      </h3>
                      <Link
                        to={`/chat?resume=${encodeURIComponent(goal.session_id)}`}
                        className="mt-1 block truncate text-xs text-midground hover:underline"
                      >
                        {goal.session_title || goal.session_id}
                      </Link>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {goal.status === "active" && (
                        <Button
                          ghost
                          size="icon"
                          aria-label="Pause goal"
                          title="Pause"
                          disabled={busy !== null}
                          onClick={() => void act(goal, "pause")}
                        >
                          <CirclePause />
                        </Button>
                      )}
                      {goal.status === "paused" && (
                        <Button
                          ghost
                          size="icon"
                          aria-label="Resume goal"
                          title="Resume"
                          disabled={busy !== null}
                          onClick={() => void act(goal, "resume")}
                        >
                          <Play />
                        </Button>
                      )}
                      {(goal.status === "active" ||
                        goal.status === "paused") && (
                        <Button
                          ghost
                          size="icon"
                          aria-label="Clear goal"
                          title="Clear"
                          className="text-destructive"
                          disabled={busy !== null}
                          onClick={() => void act(goal, "clear")}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Turn budget</span>
                      <span>
                        {goal.turns_used} / {goal.max_turns}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden bg-muted">
                      <div
                        className="h-full bg-midground"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {goal.subgoals.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs text-muted-foreground">
                        Acceptance criteria
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-foreground">
                        {goal.subgoals.map(item => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {goal.last_reason && (
                    <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Latest verdict:
                      </span>{" "}
                      {goal.last_reason}
                    </div>
                  )}
                  {goal.waiting_reason && (
                    <div className="mt-3 border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                      Waiting: {goal.waiting_reason}
                    </div>
                  )}
                  {goal.status === "done" && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Goal completed
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Activity,
  Bot,
  Boxes,
  RefreshCw,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { api } from "@/lib/api";
import type {
  KanbanBoardInfo,
  KanbanRosterResponse,
  KanbanWorkerInfo,
  ProfileInfo,
} from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageIntro,
} from "@/components/operations/OperationsUi";

interface FleetData {
  profiles: ProfileInfo[];
  boards: KanbanBoardInfo[];
  rosters: KanbanRosterResponse[];
  workers: KanbanWorkerInfo[];
}

function roleFor(profile: string, roster: KanbanRosterResponse): string | null {
  if (roster.roster.orchestrator === profile) return "orchestrator";
  if (roster.roster.reviewers.includes(profile)) return "reviewer";
  if (roster.roster.workers.includes(profile)) return "worker";
  return null;
}

export default function FleetPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [profiles, boardResult, workerResult] = await Promise.all([
      api
        .getProfiles()
        .then(value => value.profiles)
        .catch(() => []),
      api.getKanbanBoards().catch(() => ({ boards: [], current: "default" })),
      api
        .getKanbanActiveWorkers()
        .catch(() => ({ workers: [], count: 0, checked_at: 0 })),
    ]);
    const rosters = await Promise.all(
      boardResult.boards.map(board =>
        api.getKanbanRoster(board.slug).catch(() => null),
      ),
    );
    setData({
      profiles,
      boards: boardResult.boards,
      rosters: rosters.filter(
        (roster): roster is KanbanRosterResponse => roster !== null,
      ),
      workers: workerResult.workers,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data || !needle) return data?.profiles ?? [];
    return data.profiles.filter(profile =>
      [
        profile.name,
        profile.description,
        profile.model,
        profile.provider,
        profile.distribution_name,
        profile.distribution_version,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle)),
    );
  }, [data, query]);

  if (loading && !data) return <LoadingState label="Loading agent fleet…" />;
  const drifted = data!.rosters
    .flatMap(roster => roster.profiles)
    .filter(profile => profile.drifted);
  const rostered = new Set(
    data!.rosters.flatMap(roster =>
      roster.profiles.map(profile => profile.name),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Agent fleet"
        description="A human-auditable view of profile identity, role, model, skills, current work, distribution version, and board pin health."
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
          label="Profiles"
          value={data!.profiles.length}
          detail={`${rostered.size} used by board rosters`}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Active workers"
          value={data!.workers.length}
          detail="Dispatcher-spawned processes"
          tone={data!.workers.length ? "success" : "neutral"}
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricCard
          label="Boards"
          value={data!.boards.length}
          detail={`${data!.rosters.length} roster(s) verified`}
          icon={<Boxes className="h-5 w-5" />}
        />
        <MetricCard
          label="Version drift"
          value={drifted.length}
          detail={
            drifted.length ? "Dispatch may be blocked" : "Roster pins match"
          }
          tone={drifted.length ? "danger" : "success"}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search profile, model, provider, or version…"
          className="max-w-lg"
        />
        <Button
          outlined
          size="sm"
          onClick={() => navigate("/profiles")}
          prefix={<UserCog className="h-4 w-4" />}
        >
          Manage profiles
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching profiles"
          description="Change the search or create a profile from the Profiles page."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map(profile => {
            const assignments = data!.rosters
              .map(roster => ({
                board: roster.board,
                role: roleFor(profile.name, roster),
                verification: roster.profiles.find(
                  entry => entry.name === profile.name,
                ),
              }))
              .filter(entry => entry.role);
            const worker = data!.workers.find(
              entry =>
                entry.profile === profile.name ||
                entry.task_assignee === profile.name,
            );
            const hasDrift = assignments.some(
              entry => entry.verification?.drifted,
            );
            return (
              <Card key={profile.name}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">
                          {profile.display_name || profile.name}
                        </h3>
                        {profile.is_default && (
                          <Badge tone="secondary">default</Badge>
                        )}
                        {worker && <Badge tone="success">running</Badge>}
                        {hasDrift && (
                          <Badge tone="destructive">version drift</Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {profile.description || "No profile description"}
                      </p>
                    </div>
                    <Link
                      to="/profiles"
                      className="text-xs text-midground hover:underline"
                    >
                      Edit
                    </Link>
                  </div>

                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Model</dt>
                      <dd className="mt-1 break-all">
                        {profile.provider ? `${profile.provider} / ` : ""}
                        {profile.model || "Not configured"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Skills</dt>
                      <dd className="mt-1">{profile.skill_count} installed</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Distribution</dt>
                      <dd className="mt-1 break-all">
                        {profile.distribution_name || "local"}
                        {profile.distribution_version
                          ? ` @ ${profile.distribution_version}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Gateway</dt>
                      <dd className="mt-1">
                        {profile.gateway_running ? "Running" : "Stopped"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 border-t border-border pt-3">
                    <div className="text-xs text-muted-foreground">
                      Board roles
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assignments.length ? (
                        assignments.map(entry => (
                          <Badge
                            key={`${entry.board}:${entry.role}`}
                            tone={
                              entry.verification?.drifted
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {entry.board} · {entry.role}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not assigned to a strict roster
                        </span>
                      )}
                    </div>
                  </div>

                  {worker && (
                    <div className="mt-4 border border-success/30 bg-success/5 p-3 text-xs">
                      <div className="font-medium text-foreground">
                        Working on {worker.task_title}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {worker.task_id} · PID {worker.worker_pid} · heartbeat{" "}
                        {worker.last_heartbeat_at
                          ? new Date(
                              worker.last_heartbeat_at * 1000,
                            ).toLocaleString()
                          : "not reported"}
                      </div>
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

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  FolderGit2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { api } from "@/lib/api";
import type { HermesProject, KanbanBoardInfo } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  PageIntro,
  SectionHeading,
} from "@/components/operations/OperationsUi";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<HermesProject[]>([]);
  const [boards, setBoards] = useState<KanbanBoardInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [boardSlug, setBoardSlug] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [projectResult, boardResult] = await Promise.all([
      api.getProjects(),
      api.getKanbanBoards().catch(() => ({ boards: [], current: "default" })),
    ]);
    setProjects(projectResult.projects);
    setActiveId(projectResult.active_id);
    setBoards(boardResult.boards);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(reason => {
        setError(String(reason));
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const create = async () => {
    if (!name.trim() || !path.trim()) {
      setError("Project name and primary folder are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        board_slug: boardSlug || undefined,
        primary_path: path.trim(),
        folders: [path.trim()],
        use: true,
      });
      setName("");
      setPath("");
      setDescription("");
      setBoardSlug("");
      setShowCreate(false);
      await load();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const archive = async (project: HermesProject) => {
    setError(null);
    try {
      await api.archiveProject(project.id, project.archived);
      await load();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const activate = async (project: HermesProject) => {
    setError(null);
    try {
      await api.activateProject(project.id);
      await load();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const remove = async (project: HermesProject) => {
    if (
      !window.confirm(
        `Delete project "${project.name}"? Its folders and Kanban data are not deleted.`,
      )
    )
      return;
    setError(null);
    try {
      await api.deleteProject(project.id);
      await load();
    } catch (reason) {
      setError(String(reason));
    }
  };

  if (loading && projects.length === 0)
    return <LoadingState label="Loading projects…" />;
  const visible = projects.filter(project => showArchived || !project.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Projects and workspaces"
        description="Bind human-named projects to folders and Kanban boards. Profiles remain isolated; the project is the auditable workspace boundary."
        actions={
          <>
            <Button
              ghost
              size="sm"
              onClick={() => void load()}
              prefix={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreate(value => !value)}
              prefix={<Plus className="h-4 w-4" />}
            >
              New project
            </Button>
          </>
        }
      />

      {showCreate && (
        <Card>
          <CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Project name
              <Input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Sellhand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Primary folder
              <Input
                value={path}
                onChange={event => setPath(event.target.value)}
                placeholder="/home/anga/workspace/projects/sellhand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Kanban board
              <select
                value={boardSlug}
                onChange={event => setBoardSlug(event.target.value)}
                className="h-10 border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">No board binding</option>
                {boards.map(board => (
                  <option key={board.slug} value={board.slug}>
                    {board.name || board.slug}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Description
              <Input
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="What this workspace owns"
              />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={() => void create()} disabled={saving}>
                {saving ? "Creating…" : "Create project"}
              </Button>
              <Button ghost onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <SectionHeading
        title="Workspace registry"
        description="Folders are referenced, never copied or deleted by project removal."
        action={
          <Button
            ghost
            size="sm"
            onClick={() => setShowArchived(value => !value)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to make the relationship between a repository, a board, and its agent work explicit."
          action={
            <Button onClick={() => setShowCreate(true)}>Create project</Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map(project => (
            <Card key={project.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <FolderGit2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">
                          {project.name}
                        </h3>
                        {project.id === activeId && (
                          <Badge tone="success">active</Badge>
                        )}
                        {project.archived && (
                          <Badge tone="secondary">archived</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.description || project.slug}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!project.archived && project.id !== activeId && (
                      <Button
                        ghost
                        size="sm"
                        onClick={() => void activate(project)}
                      >
                        Use
                      </Button>
                    )}
                    <Button
                      ghost
                      size="icon"
                      aria-label={
                        project.archived ? "Restore project" : "Archive project"
                      }
                      title={project.archived ? "Restore" : "Archive"}
                      onClick={() => void archive(project)}
                    >
                      {project.archived ? <RotateCcw /> : <Archive />}
                    </Button>
                    <Button
                      ghost
                      size="icon"
                      aria-label="Delete project"
                      title="Delete"
                      className="text-destructive"
                      onClick={() => void remove(project)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Primary folder</dt>
                    <dd className="mt-1 break-all font-mono text-foreground">
                      {project.primary_path || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Kanban board</dt>
                    <dd className="mt-1 text-foreground">
                      {project.board_slug || "Not bound"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Folders</dt>
                    <dd className="mt-1 space-y-1">
                      {project.folders.length
                        ? project.folders.map(folder => (
                            <div
                              key={folder.path}
                              className="break-all font-mono"
                            >
                              {folder.path}
                              {folder.is_primary ? " · primary" : ""}
                            </div>
                          ))
                        : "None"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

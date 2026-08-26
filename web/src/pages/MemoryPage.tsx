import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Download, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { Input } from "@nous-research/ui/ui/components/input";
import { api } from "@/lib/api";
import type { MemoryDocument, MemoryStatus } from "@/lib/api";
import {
  LoadingState,
  MetricCard,
  PageIntro,
  SectionHeading,
} from "@/components/operations/OperationsUi";

function downloadDocument(document: MemoryDocument, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = document.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function MemoryPage() {
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [documents, setDocuments] = useState<MemoryDocument[]>([]);
  const [activeKind, setActiveKind] = useState<"memory" | "user">("memory");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [memory, docs] = await Promise.all([
      api.getMemory(),
      api.getMemoryDocuments(),
    ]);
    setStatus(memory);
    setDocuments(docs.documents);
    const selected = docs.documents.find(
      document => document.kind === activeKind,
    );
    setDraft(selected?.content ?? "");
    setLoading(false);
  }, [activeKind]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(reason => {
        setMessage(String(reason));
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const active = documents.find(document => document.kind === activeKind);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return draft
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(row => row.line.toLowerCase().includes(needle))
      .slice(0, 25);
  }, [draft, query]);

  const selectDocument = (kind: "memory" | "user") => {
    setActiveKind(kind);
    setDraft(documents.find(document => document.kind === kind)?.content ?? "");
    setQuery("");
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateMemoryDocument(activeKind, draft);
      setMessage("Saved. New sessions will read the updated memory document.");
      await load();
    } catch (reason) {
      setMessage(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (
      !window.confirm(
        `Delete ${active?.filename || activeKind}? This cannot be undone.`,
      )
    )
      return;
    setMessage(null);
    try {
      await api.resetMemory(activeKind);
      setDraft("");
      setMessage(`${active?.filename || activeKind} deleted.`);
      await load();
    } catch (reason) {
      setMessage(String(reason));
    }
  };

  if (loading && !status) return <LoadingState label="Loading memory data…" />;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Memory and profile data"
        description="Inspect, search, export, edit, and remove the selected profile’s built-in memory documents. Provider configuration remains isolated per profile."
        actions={
          <Button
            ghost
            size="sm"
            onClick={() => void load()}
            prefix={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active provider"
          value={status?.active || "Built-in"}
          detail="Current profile memory backend"
          icon={<Brain className="h-5 w-5" />}
        />
        <MetricCard
          label="Long-term memory"
          value={`${status?.builtin_files.memory ?? 0} B`}
          detail="MEMORY.md persisted bytes"
        />
        <MetricCard
          label="User profile"
          value={`${status?.builtin_files.user ?? 0} B`}
          detail="USER.md persisted bytes"
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Provider health"
          description="Availability and setup state for discovered memory providers."
        />
        <div className="flex flex-wrap gap-2">
          {status?.providers.map(provider => (
            <Badge
              key={provider.name}
              tone={
                provider.status === "ready"
                  ? "success"
                  : provider.status === "needs_config"
                    ? "warning"
                    : "secondary"
              }
            >
              {provider.name} · {provider.status.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </section>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2">
              <Button
                size="sm"
                outlined={activeKind !== "memory"}
                onClick={() => selectDocument("memory")}
              >
                MEMORY.md
              </Button>
              <Button
                size="sm"
                outlined={activeKind !== "user"}
                onClick={() => selectDocument("user")}
              >
                USER.md
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                outlined
                size="sm"
                onClick={() => active && downloadDocument(active, draft)}
                disabled={!active}
                prefix={<Download className="h-4 w-4" />}
              >
                Export
              </Button>
              <Button
                outlined
                size="sm"
                onClick={() => void clear()}
                disabled={!active}
                prefix={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={saving}
                prefix={<Save className="h-4 w-4" />}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="grid min-h-[32rem] lg:grid-cols-[1fr_22rem]">
            <div className="flex min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
              <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                {active?.path || "Memory document"} · {new Blob([draft]).size}{" "}
                bytes
              </div>
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                spellCheck={false}
                aria-label={`Edit ${active?.filename || activeKind}`}
                className="min-h-[28rem] flex-1 resize-y bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-midground"
              />
            </div>

            <aside className="flex flex-col gap-3 p-4">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="memory-search"
              >
                Search this document
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="memory-search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Find text…"
                  className="pl-9"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {query
                  ? `${matches.length}${matches.length === 25 ? "+" : ""} matching line(s)`
                  : "Search results include line provenance."}
              </div>
              <div className="max-h-[24rem] space-y-2 overflow-auto">
                {matches.map(match => (
                  <div
                    key={`${match.number}:${match.line}`}
                    className="border border-border p-2 text-xs"
                  >
                    <div className="mb-1 text-muted-foreground">
                      Line {match.number}
                    </div>
                    <div className="break-words font-mono text-foreground">
                      {match.line}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>

      {message && (
        <div
          role="status"
          className="border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
        >
          {message}
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Memory changes affect future sessions. Existing conversations keep their
        cached prompt unchanged until normal context compression or a new
        session.
      </p>
    </div>
  );
}

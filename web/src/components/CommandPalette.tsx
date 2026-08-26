import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { FileSearch, Search, Terminal, X } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import type { SessionInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface CommandPaletteItem {
  path: string;
  label: string;
}

export function CommandPalette({
  items,
  collapsed,
}: {
  items: CommandPaletteItem[];
  collapsed: boolean;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSessions([]);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else setOpen(true);
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const needle = query.trim();
    if (!open || needle.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .searchSessions(needle)
        .then(result => {
          if (!cancelled) setSessions(result.results?.slice(0, 6) ?? []);
        })
        .catch(() => {
          if (!cancelled) setSessions([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const navMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter(
        (item, index, all) =>
          all.findIndex(candidate => candidate.path === item.path) === index,
      )
      .filter(
        item =>
          !needle ||
          item.label.toLowerCase().includes(needle) ||
          item.path.includes(needle),
      )
      .slice(0, 10);
  }, [items, query]);

  const go = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <>
      <Button
        ghost
        onClick={() => setOpen(true)}
        aria-label="Search dashboard"
        title="Search dashboard (Ctrl+K)"
        className={cn(
          "mx-2 my-2 flex h-9 items-center border border-current/15 text-text-secondary",
          collapsed
            ? "w-10 justify-center px-0"
            : "w-[calc(100%-1rem)] justify-start gap-2 px-3",
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-xs">Search</span>
            <kbd className="text-[10px] text-text-tertiary">Ctrl K</kbd>
          </>
        )}
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-start justify-center bg-black/70 px-4 pt-[10vh]"
            role="presentation"
            onMouseDown={event => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search Hermes dashboard"
              className="w-full max-w-2xl border border-border bg-background-base shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="h-5 w-5 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={event => {
                    const next = event.target.value;
                    setQuery(next);
                    if (next.trim().length < 2) setSessions([]);
                  }}
                  placeholder="Go to a page or find a session…"
                  className="h-14 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button
                  ghost
                  size="icon"
                  onClick={close}
                  aria-label="Close search"
                >
                  <X />
                </Button>
              </div>

              <div className="max-h-[60vh] overflow-auto p-2">
                {navMatches.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Pages and commands
                    </div>
                    {navMatches.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => go(item.path)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                      >
                        <Terminal className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{item.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.path}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {sessions.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Sessions
                    </div>
                    {sessions.map(session => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() =>
                          go(`/chat?resume=${encodeURIComponent(session.id)}`)
                        }
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                      >
                        <FileSearch className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {session.title || session.preview || session.id}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {session.source || "cli"} ·{" "}
                            {session.model || "unknown model"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {navMatches.length === 0 && sessions.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No matching page or session.
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

"""Dashboard operations routes.

These routes expose existing profile-scoped stores to the web dashboard.  They
do not introduce a second project, goal, or memory implementation: Projects
delegate to :mod:`hermes_cli.projects_db`, goals enumerate the same
``state_meta`` rows used by :mod:`hermes_cli.goals`, and memory documents are
the built-in ``MEMORY.md`` / ``USER.md`` files.
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from hermes_cli.web_routers._common import _profile_scope
from hermes_constants import get_hermes_home


router = APIRouter()


class ProjectCreateBody(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    board_slug: Optional[str] = None
    primary_path: Optional[str] = None
    folders: list[str] = Field(default_factory=list)
    use: bool = False
    profile: Optional[str] = None


class ProjectUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    board_slug: Optional[str] = None
    profile: Optional[str] = None


class ProjectFolderBody(BaseModel):
    path: str
    label: Optional[str] = None
    is_primary: bool = False
    profile: Optional[str] = None


class GoalActionBody(BaseModel):
    action: Literal["pause", "resume", "clear"]
    profile: Optional[str] = None


class MemoryDocumentBody(BaseModel):
    content: str
    profile: Optional[str] = None


def _project_payload(conn) -> dict[str, Any]:
    from hermes_cli import projects_db as pdb

    return {
        "projects": [
            project.to_dict()
            for project in pdb.list_projects(conn, include_archived=True)
        ],
        "active_id": pdb.get_active_id(conn),
    }


def _require_project(conn, project_id: str):
    from hermes_cli import projects_db as pdb

    project = pdb.get_project(conn, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/api/projects")
def list_projects(profile: Optional[str] = None):
    from hermes_cli import projects_db as pdb

    with _profile_scope(profile):
        with pdb.connect_closing() as conn:
            return _project_payload(conn)


@router.post("/api/projects")
def create_project(body: ProjectCreateBody):
    from hermes_cli import projects_db as pdb

    try:
        with _profile_scope(body.profile):
            with pdb.connect_closing() as conn:
                project_id = pdb.create_project(
                    conn,
                    name=body.name,
                    slug=body.slug,
                    folders=body.folders,
                    primary_path=body.primary_path,
                    description=body.description,
                    icon=body.icon,
                    color=body.color,
                    board_slug=body.board_slug,
                )
                if body.use:
                    pdb.set_active(conn, project_id)
                project = pdb.get_project(conn, project_id)
                return {"project": project.to_dict() if project else None}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/api/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdateBody):
    from hermes_cli import projects_db as pdb

    try:
        with _profile_scope(body.profile):
            with pdb.connect_closing() as conn:
                project = _require_project(conn, project_id)
                pdb.update_project(
                    conn,
                    project.id,
                    name=body.name,
                    description=body.description,
                    icon=body.icon,
                    color=body.color,
                    board_slug=body.board_slug,
                )
                return {"project": pdb.get_project(conn, project.id).to_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/projects/{project_id}/folders")
def add_project_folder(project_id: str, body: ProjectFolderBody):
    from hermes_cli import projects_db as pdb

    try:
        with _profile_scope(body.profile):
            with pdb.connect_closing() as conn:
                project = _require_project(conn, project_id)
                pdb.add_folder(
                    conn,
                    project.id,
                    body.path,
                    label=body.label,
                    is_primary=body.is_primary,
                )
                return {"project": pdb.get_project(conn, project.id).to_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/api/projects/{project_id}/folders")
def remove_project_folder(
    project_id: str,
    path: str = Query(...),
    profile: Optional[str] = None,
):
    from hermes_cli import projects_db as pdb

    with _profile_scope(profile):
        with pdb.connect_closing() as conn:
            project = _require_project(conn, project_id)
            pdb.remove_folder(conn, project.id, path)
            return {"project": pdb.get_project(conn, project.id).to_dict()}


@router.post("/api/projects/{project_id}/archive")
def archive_project(
    project_id: str,
    restore: bool = False,
    profile: Optional[str] = None,
):
    from hermes_cli import projects_db as pdb

    with _profile_scope(profile):
        with pdb.connect_closing() as conn:
            project = _require_project(conn, project_id)
            if restore:
                pdb.restore_project(conn, project.id)
            else:
                pdb.archive_project(conn, project.id)
            return _project_payload(conn)


@router.post("/api/projects/{project_id}/activate")
def activate_project(project_id: str, profile: Optional[str] = None):
    from hermes_cli import projects_db as pdb

    with _profile_scope(profile):
        with pdb.connect_closing() as conn:
            project = _require_project(conn, project_id)
            if project.archived:
                raise HTTPException(
                    status_code=409, detail="Archived projects cannot be activated"
                )
            pdb.set_active(conn, project.id)
            return _project_payload(conn)


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str, profile: Optional[str] = None):
    from hermes_cli import projects_db as pdb

    with _profile_scope(profile):
        with pdb.connect_closing() as conn:
            project = _require_project(conn, project_id)
            pdb.delete_project(conn, project.id)
            return _project_payload(conn)


def _goal_payload(profile: Optional[str]) -> dict[str, Any]:
    from hermes_cli.goals import GoalState
    from hermes_state_registry import acquire, release_or_close

    with _profile_scope(profile):
        # The registry's shared handle, never a bare SessionDB(): a second writer per
        # profile beside the gateway's is the #90837 corruption shape, and GoalManager
        # (which the mutate endpoint uses) reads through this same handle.
        db = acquire(get_hermes_home() / "state.db")
        try:
            goals: list[dict[str, Any]] = []
            for key, raw in db.list_meta_prefix("goal:"):
                session_id = key.removeprefix("goal:")
                try:
                    state = GoalState.from_json(raw)
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
                session = db.get_session(session_id) or {}
                item = json.loads(state.to_json())
                item.update(
                    {
                        "session_id": session_id,
                        "session_title": session.get("title"),
                        "session_source": session.get("source"),
                        "session_model": session.get("model"),
                    }
                )
                goals.append(item)
            goals.sort(
                key=lambda item: float(
                    item.get("last_turn_at") or item.get("created_at") or 0
                ),
                reverse=True,
            )
            return {"goals": goals, "count": len(goals)}
        finally:
            release_or_close(db)


@router.get("/api/goals")
def list_goals(profile: Optional[str] = None):
    return _goal_payload(profile)


@router.post("/api/goals/{session_id}")
def mutate_goal(session_id: str, body: GoalActionBody):
    from hermes_cli.goals import GoalManager

    with _profile_scope(body.profile):
        manager = GoalManager(session_id)
        if not manager.state:
            raise HTTPException(status_code=404, detail="Goal not found")
        if body.action == "pause":
            manager.pause("dashboard")
        elif body.action == "resume":
            manager.resume()
        else:
            manager.clear()
    return _goal_payload(body.profile)


_MEMORY_DOCUMENTS = {"memory": "MEMORY.md", "user": "USER.md"}
_MEMORY_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024


def _memory_document(kind: str) -> tuple[Path, str]:
    filename = _MEMORY_DOCUMENTS.get(kind)
    if filename is None:
        raise HTTPException(status_code=404, detail="Memory document not found")
    path = get_hermes_home() / "memories" / filename
    if not path.exists():
        return path, ""
    try:
        size = path.stat().st_size
        if size > _MEMORY_DOCUMENT_MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{filename} exceeds the dashboard 2 MiB editing limit",
            )
        return path, path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"{filename} is not UTF-8") from exc


@router.get("/api/memory/documents")
def list_memory_documents(profile: Optional[str] = None):
    with _profile_scope(profile):
        documents = []
        for kind, filename in _MEMORY_DOCUMENTS.items():
            path, content = _memory_document(kind)
            documents.append(
                {
                    "kind": kind,
                    "filename": filename,
                    "path": str(path),
                    "content": content,
                    "size": len(content.encode("utf-8")),
                    "updated_at": path.stat().st_mtime if path.exists() else None,
                }
            )
        return {"documents": documents}


@router.put("/api/memory/documents/{kind}")
def update_memory_document(kind: str, body: MemoryDocumentBody):
    encoded = body.content.encode("utf-8")
    if len(encoded) > _MEMORY_DOCUMENT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Memory document exceeds 2 MiB")
    with _profile_scope(body.profile):
        path, _ = _memory_document(kind)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_bytes(encoded)
        os.replace(temp, path)
    return {"ok": True, "kind": kind, "size": len(encoded)}


_AUDIT_LOCK = threading.Lock()
_AUDIT_MAX_BYTES = 5 * 1024 * 1024


def _audit_path() -> Path:
    return get_hermes_home() / "logs" / "dashboard-audit.jsonl"


def record_dashboard_mutation(
    *, method: str, path: str, status: int, profile: Optional[str]
) -> None:
    """Append metadata for a dashboard mutation without recording payloads.

    Bodies are deliberately excluded: config, env, and plugin requests may
    contain secrets.  Method + normalized route + response status are enough
    for a human-auditable dashboard activity trail.
    """

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "epoch": time.time(),
        "method": method.upper(),
        "path": path,
        "status": int(status),
        "profile": profile or "current",
    }
    target = _audit_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, separators=(",", ":"), ensure_ascii=False) + "\n"
    with _AUDIT_LOCK:
        try:
            if target.exists() and target.stat().st_size >= _AUDIT_MAX_BYTES:
                rotated = target.with_suffix(".jsonl.1")
                rotated.unlink(missing_ok=True)
                os.replace(target, rotated)
            with target.open("a", encoding="utf-8") as handle:
                handle.write(line)
        except OSError:
            # An audit write must never turn a successful dashboard mutation
            # into a failed user action. The middleware reports unexpected
            # failures at debug level without exposing request content.
            return


@router.get("/api/activity")
def list_dashboard_activity(limit: int = Query(100, ge=1, le=500)):
    target = _audit_path()
    if not target.exists():
        return {"events": [], "count": 0}
    try:
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not read activity: {exc}")
    events = []
    for line in reversed(lines[-limit:]):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return {"events": events, "count": len(events)}

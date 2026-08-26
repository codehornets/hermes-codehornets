"""Behavior contracts for the dashboard operations surfaces."""

from __future__ import annotations

from pathlib import Path

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def dashboard(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HERMES_DASHBOARD_SESSION_TOKEN", "operations-test-token")

    from hermes_cli import web_server

    previous_auth = getattr(web_server.app.state, "auth_required", None)
    previous_host = getattr(web_server.app.state, "bound_host", None)
    web_server.app.state.auth_required = False
    web_server.app.state.bound_host = None
    client = TestClient(web_server.app, raise_server_exceptions=False)
    client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN
    try:
        yield client, tmp_path
    finally:
        client.close()
        if previous_auth is None:
            delattr(web_server.app.state, "auth_required")
        else:
            web_server.app.state.auth_required = previous_auth
        if previous_host is None:
            if hasattr(web_server.app.state, "bound_host"):
                delattr(web_server.app.state, "bound_host")
        else:
            web_server.app.state.bound_host = previous_host


def test_project_registry_uses_real_profile_store(dashboard):
    client, home = dashboard
    workspace = home / "workspace"
    workspace.mkdir()

    created = client.post(
        "/api/projects",
        json={
            "name": "Operations",
            "primary_path": str(workspace),
            "folders": [str(workspace)],
            "board_slug": "operations",
            "use": True,
        },
    )
    assert created.status_code == 200, created.text
    project = created.json()["project"]
    assert project["primary_path"] == str(workspace)
    assert project["board_slug"] == "operations"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert listed.json()["active_id"] == project["id"]
    assert [item["id"] for item in listed.json()["projects"]] == [project["id"]]
    assert (home / "projects.db").exists()

    second_workspace = home / "second-workspace"
    second_workspace.mkdir()
    second = client.post(
        "/api/projects",
        json={
            "name": "Second project",
            "primary_path": str(second_workspace),
            "folders": [str(second_workspace)],
        },
    )
    assert second.status_code == 200, second.text
    second_id = second.json()["project"]["id"]

    activated = client.post(f"/api/projects/{second_id}/activate")
    assert activated.status_code == 200, activated.text
    assert activated.json()["active_id"] == second_id


def test_goal_view_enumerates_goal_manager_state(dashboard):
    client, _home = dashboard
    from hermes_cli.goals import GoalState, save_goal

    save_goal(
        "s_operations",
        GoalState(
            goal="Ship the operations dashboard",
            turns_used=3,
            max_turns=12,
            created_at=10,
            last_turn_at=20,
            subgoals=["Build", "Verify"],
        ),
    )

    response = client.get("/api/goals")
    assert response.status_code == 200, response.text
    goal = response.json()["goals"][0]
    assert goal["session_id"] == "s_operations"
    assert goal["goal"] == "Ship the operations dashboard"
    assert goal["subgoals"] == ["Build", "Verify"]

    paused = client.post(
        "/api/goals/s_operations", json={"action": "pause"}
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["goals"][0]["status"] == "paused"


def test_memory_documents_are_readable_editable_and_profile_scoped(dashboard):
    client, home = dashboard
    response = client.put(
        "/api/memory/documents/memory",
        json={"content": "# Durable fact\n\nSource: operator\n"},
    )
    assert response.status_code == 200, response.text

    listed = client.get("/api/memory/documents")
    assert listed.status_code == 200
    memory = next(
        item for item in listed.json()["documents"] if item["kind"] == "memory"
    )
    assert memory["content"] == "# Durable fact\n\nSource: operator\n"
    assert Path(memory["path"]) == home / "memories" / "MEMORY.md"


def test_memory_status_and_reset_honor_selected_profile(
    dashboard, monkeypatch
):
    client, home = dashboard
    from hermes_cli import web_server_profiles

    default_memory = home / "memories" / "MEMORY.md"
    default_memory.parent.mkdir(parents=True, exist_ok=True)
    default_memory.write_text("default memory", encoding="utf-8")

    worker_home = home / "profiles" / "worker"
    worker_memory = worker_home / "memories" / "MEMORY.md"
    worker_memory.parent.mkdir(parents=True, exist_ok=True)
    worker_memory.write_text("worker memory", encoding="utf-8")
    monkeypatch.setattr(
        web_server_profiles, "_resolve_profile_dir", lambda name: worker_home
    )

    status = client.get("/api/memory?profile=worker")
    assert status.status_code == 200, status.text
    assert status.json()["builtin_files"]["memory"] == len("worker memory")

    reset = client.post(
        "/api/memory/reset?profile=worker", json={"target": "memory"}
    )
    assert reset.status_code == 200, reset.text
    assert not worker_memory.exists()
    assert default_memory.read_text(encoding="utf-8") == "default memory"


def test_mutation_audit_excludes_request_payloads(dashboard):
    client, home = dashboard
    workspace = home / "secret-looking-workspace-name"
    workspace.mkdir()
    response = client.post(
        "/api/projects",
        json={
            "name": "private-project-name",
            "primary_path": str(workspace),
            "folders": [str(workspace)],
        },
    )
    assert response.status_code == 200, response.text

    activity = client.get("/api/activity")
    assert activity.status_code == 200
    event = activity.json()["events"][0]
    assert event["method"] == "POST"
    assert event["path"] == "/api/projects"
    assert event["status"] == 200

    raw = (home / "logs" / "dashboard-audit.jsonl").read_text(encoding="utf-8")
    assert "private-project-name" not in raw
    assert "secret-looking-workspace-name" not in raw

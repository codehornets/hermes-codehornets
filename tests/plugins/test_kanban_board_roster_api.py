"""Dashboard behavior for board rosters, policy, and drift reporting."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli import kanban_db as kb


def _router():
    root = Path(__file__).resolve().parents[2]
    path = root / "plugins" / "kanban" / "dashboard" / "plugin_api.py"
    spec = importlib.util.spec_from_file_location("hermes_kanban_roster_api_test", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.router


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    profile = home / "profiles" / "worker"
    profile.mkdir(parents=True)
    (profile / "config.yaml").write_text("model:\n  default: test-model\n", encoding="utf-8")
    (profile / "SOUL.md").write_text("# Worker\n", encoding="utf-8")
    kb._INITIALIZED_PATHS.clear()
    app = FastAPI()
    app.include_router(_router(), prefix="/api/plugins/kanban")
    return TestClient(app)


def test_board_patch_pins_roster_and_roster_endpoint_reports_drift(client: TestClient) -> None:
    assert client.post("/api/plugins/kanban/boards", json={"slug": "audit"}).status_code == 200
    response = client.patch(
        "/api/plugins/kanban/boards/audit",
        json={
            "roster": {"workers": ["worker"], "reviewers": [], "orchestrator": None},
            "policy": {
                "allow_unlisted_profiles": False,
                "require_review": False,
                "enforce_profile_pins": True,
            },
        },
    )
    assert response.status_code == 200, response.text
    board = response.json()["board"]
    assert board["roster"]["workers"] == ["worker"]
    assert board["profile_pins"]["worker"]["definition_sha256"]

    report = client.get("/api/plugins/kanban/boards/audit/roster")
    assert report.status_code == 200
    assert report.json()["ok"] is True


def test_board_patch_rejects_missing_profiles(client: TestClient) -> None:
    client.post("/api/plugins/kanban/boards", json={"slug": "audit"})
    response = client.patch(
        "/api/plugins/kanban/boards/audit",
        json={"roster": {"workers": ["not-installed"], "reviewers": []}},
    )
    assert response.status_code == 400
    assert "not-installed" in response.json()["detail"]

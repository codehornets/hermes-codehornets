"""Behavior contracts for board-owned profile rosters and run provenance."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli import kanban_db_dispatch as kbd


@pytest.fixture
def roster_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
    monkeypatch.delenv("HERMES_KANBAN_BOARD", raising=False)
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    for name, model in (("worker", "worker-model"), ("reviewer", "review-model"), ("outsider", "other-model")):
        profile = home / "profiles" / name
        profile.mkdir(parents=True)
        (profile / "config.yaml").write_text(
            f"model:\n  default: {model}\n  provider: test\n", encoding="utf-8"
        )
        (profile / "SOUL.md").write_text(f"# {name}\n", encoding="utf-8")
        (profile / "distribution.yaml").write_text(
            f"name: test-{name}\nversion: 1.0.0\nsource: local\n", encoding="utf-8"
        )
    kb._INITIALIZED_PATHS.clear()
    kb.create_board("project")
    return home


def _strict_board() -> None:
    kb.write_board_metadata(
        "project",
        roster={"orchestrator": None, "workers": ["worker"], "reviewers": ["reviewer"]},
        policy={
            "allow_unlisted_profiles": False,
            "require_review": False,
            "enforce_profile_pins": False,
        },
        profile_pins={"worker": kb.profile_pin("worker"), "reviewer": kb.profile_pin("reviewer")},
    )


def test_legacy_board_is_permissive_and_has_stable_roster_shape(roster_home: Path) -> None:
    meta = kb.read_board_metadata("project")
    assert meta["roster"] == {"orchestrator": None, "workers": [], "reviewers": []}
    assert meta["policy"]["allow_unlisted_profiles"] is True
    assert kb.board_profile_allowed("outsider", board="project")[0] is True


def test_strict_roster_enforces_creation_assignment_and_review_roles(roster_home: Path) -> None:
    _strict_board()
    with kb.scoped_current_board("project"), kbc.connect_closing(board="project") as conn:
        task_id = kb.create_task(
            conn, title="Allowed work", assignee="worker",
            initial_status="running", board="project",
        )
        with pytest.raises(ValueError, match="not in the board worker roster"):
            kb.create_task(
                conn, title="Unlisted work", assignee="outsider",
                initial_status="running", board="project",
            )
        with pytest.raises(ValueError, match="not in the board worker roster"):
            kb.assign_task(conn, task_id, "outsider")
        claimed = kb.claim_task(conn, task_id)
        assert claimed is not None
        with pytest.raises(ValueError, match="not in the board reviewer roster"):
            kb.request_review(
                conn, task_id, reviewer="outsider",
                expected_run_id=claimed.current_run_id,
            )


def test_dispatch_records_exact_profile_provenance(roster_home: Path) -> None:
    _strict_board()
    with kb.scoped_current_board("project"), kbc.connect_closing(board="project") as conn:
        task_id = kb.create_task(
            conn, title="Snapshot me", assignee="worker", skills=["audit"],
            initial_status="running", board="project",
        )
        result = kbd.dispatch_once(
            conn, board="project", spawn_fn=lambda task, workspace: 4321,
            max_spawn=1,
        )
        assert [item[0] for item in result.spawned] == [task_id]
        run = kb.latest_run(conn, task_id)
        assert run is not None and run.provenance is not None
        assert run.provenance["profile"]["name"] == "worker"
        assert run.provenance["profile"]["distribution"]["version"] == "1.0.0"
        assert run.provenance["model"] == {"name": "worker-model", "provider": "test"}
        assert run.provenance["skills"] == [{"name": "audit"}]
        assert run.provenance["hermes"]["version"]
        stored = conn.execute(
            "SELECT provenance FROM task_runs WHERE id = ?", (run.id,)
        ).fetchone()["provenance"]
        assert json.loads(stored) == run.provenance


def test_dispatch_rejects_legacy_unlisted_assignment_without_event_spam(roster_home: Path) -> None:
    _strict_board()
    with kb.scoped_current_board("project"), kbc.connect_closing(board="project") as conn:
        task_id = kb.create_task(
            conn, title="Legacy row", assignee="worker",
            initial_status="running", board="project",
        )
        conn.execute("UPDATE tasks SET assignee = 'outsider' WHERE id = ?", (task_id,))
        conn.commit()
        first = kbd.dispatch_once(conn, board="project", spawn_fn=lambda task, workspace: 1)
        second = kbd.dispatch_once(conn, board="project", spawn_fn=lambda task, workspace: 1)
        assert [item[0] for item in first.skipped_roster] == [task_id]
        assert [item[0] for item in second.skipped_roster] == [task_id]
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND kind = 'roster_rejected'",
            (task_id,),
        ).fetchone()["n"]
        assert count == 1


def test_pin_drift_is_reported_and_can_block_dispatch(roster_home: Path) -> None:
    _strict_board()
    meta = kb.read_board_metadata("project")
    policy = dict(meta["policy"])
    policy["enforce_profile_pins"] = True
    kb.write_board_metadata("project", policy=policy)
    profile = roster_home / "profiles" / "worker" / "SOUL.md"
    profile.write_text("# changed definition\n", encoding="utf-8")

    report = kb.verify_board_roster("project")
    worker = next(item for item in report["profiles"] if item["name"] == "worker")
    assert worker["drifted"] is True
    ok, reason = kb.board_profile_allowed("worker", board="project")
    assert ok is False
    assert "drifted" in reason


def test_required_review_blocks_worker_direct_completion(roster_home: Path) -> None:
    _strict_board()
    meta = kb.read_board_metadata("project")
    policy = dict(meta["policy"])
    policy["require_review"] = True
    kb.write_board_metadata("project", policy=policy)
    with kb.scoped_current_board("project"), kbc.connect_closing(board="project") as conn:
        task_id = kb.create_task(
            conn, title="Needs review", assignee="worker",
            initial_status="running", board="project",
        )
        claimed = kb.claim_task(conn, task_id)
        assert claimed is not None
        with pytest.raises(ValueError, match="requires review"):
            kb.complete_task(conn, task_id, expected_run_id=claimed.current_run_id)
        assert kb.request_review(
            conn, task_id, reviewer="reviewer",
            expected_run_id=claimed.current_run_id,
        )
        review_run = kb.claim_review_task(conn, task_id)
        assert review_run is not None
        assert kb.complete_task(conn, task_id, expected_run_id=review_run.current_run_id)

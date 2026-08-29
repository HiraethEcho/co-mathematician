from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .gating import check_workstream_completion
from .messages import read_messages
from .project import Project, is_project_archived
from .workspace import load_goals, read_yaml


def project_summary(project: Project) -> dict[str, object]:
    summary: dict[str, object] = {
        "name": project.name,
        "path": str(project.root),
        "workspace": str(project.workspace),
        "status": "invalid",
        "current": "The project files need attention.",
        "question": "Not confirmed yet.",
        "progress": "No goals or workstreams have started.",
        "recent_update": "",
        "blocker": "",
        "next_action": "Inspect the project files and address the first issue.",
    }
    errors: list[str] = []

    try:
        goals_path = project.workspace / "project" / "GOALS.yaml"
        if goals_path.is_symlink() or not goals_path.is_file():
            raise ValueError(f"GOALS.yaml is missing or unsafe: {goals_path}")
        goals_data = load_goals(project.workspace)
        question = goals_data.get("research_question", {})
        if isinstance(question, Mapping):
            text = str(question.get("text", "")).strip()
            if text:
                summary["question"] = _short(text)

        goals = goals_data.get("goals", [])
        if not isinstance(goals, list):
            errors.append("GOALS.yaml goals must be a list.")
            goals = []
        draft_goals = [goal for goal in goals if _goal_status(goal) == "draft"]
        approved_goals = [goal for goal in goals if _goal_status(goal) == "approved"]

        workstreams = _workstream_state(project.workspace, errors)
        recent_update = _recent_update(project.workspace, errors)
        archived = is_project_archived(project)
        working_paper = (project.workspace / "final" / "working_paper.md").is_file()

        summary["recent_update"] = recent_update
        summary["progress"] = _progress_text(
            approved=len(approved_goals),
            draft=len(draft_goals),
            active=len(workstreams["active"]),
            complete=len(workstreams["complete"]),
            working_paper=working_paper,
        )

        language = goals_data.get("language_policy", {})
        language_status = (
            str(language.get("status", "pending_user_choice"))
            if isinstance(language, Mapping)
            else "pending_user_choice"
        )
        question_status = (
            str(question.get("status", "onboarding"))
            if isinstance(question, Mapping)
            else "onboarding"
        )

        blocker = errors[0] if errors else workstreams["blocker"]
        summary["blocker"] = _short(blocker) if blocker else ""

        if errors:
            summary["status"] = "invalid"
            summary["current"] = "The project files need attention."
            summary["next_action"] = "Address the first reported project-file issue."
        elif archived:
            summary["status"] = "archived"
            summary["current"] = "The project is archived."
            summary["next_action"] = "Reopen the project when you want to continue."
        elif language_status in {"", "pending", "pending_user_choice"} or question_status != "approved":
            summary["status"] = "onboarding"
            summary["current"] = "Project setup is still in progress."
            summary["next_action"] = (
                "Confirm the research question and choose the document language."
            )
        elif workstreams["blocker"]:
            summary["status"] = "active"
            summary["current"] = "Research is waiting on review changes."
            summary["next_action"] = "Address the blocking review before continuing."
        elif workstreams["needs_execution"]:
            summary["status"] = "active"
            summary["current"] = "Research is in progress."
            summary["next_action"] = (
                f"Continue the active workstream: {workstreams['needs_execution'][0]}."
            )
        elif workstreams["needs_review"]:
            summary["status"] = "active"
            summary["current"] = "A workstream report is ready for review."
            summary["next_action"] = (
                f"Ask an independent reviewer to review: {workstreams['needs_review'][0]}."
            )
        elif working_paper:
            summary["status"] = "final_ready"
            summary["current"] = "The working paper is ready."
            summary["next_action"] = "Review the working paper, then archive the project if finished."
        elif workstreams["complete"]:
            summary["status"] = "active"
            summary["current"] = "Reviewed workstreams are ready for synthesis."
            summary["next_action"] = "Render and revise the final working paper."
        elif approved_goals:
            summary["status"] = "active"
            summary["current"] = "Approved goals are ready for research."
            summary["next_action"] = "Create a focused workstream for an approved goal."
        elif draft_goals:
            summary["status"] = "active"
            summary["current"] = "Draft goals are waiting for a decision."
            summary["next_action"] = "Ask the user to approve or revise the draft goals."
        else:
            summary["status"] = "active"
            summary["current"] = "The research question is ready."
            summary["next_action"] = "Turn the research question into a small set of draft goals."
    except Exception as exc:
        summary["blocker"] = _short(str(exc))

    return summary


def render_resume(summary: Mapping[str, object]) -> str:
    lines = [
        f"Co-Math project: {summary['name']}",
        f"Question: {summary['question']}",
        f"Progress: {summary['progress']}",
    ]
    if summary.get("recent_update"):
        lines.append(f"Recent: {summary['recent_update']}")
    if summary.get("blocker"):
        lines.append(f"Blocked by: {summary['blocker']}")
    lines.extend((f"Next: {summary['next_action']}", f"Path: {summary['path']}"))
    return "\n".join(lines)


def render_next(summary: Mapping[str, object]) -> str:
    lines = [f"{summary['name']}: {summary['current']}"]
    if summary.get("blocker"):
        lines.append(f"Blocked by: {summary['blocker']}")
    lines.append(f"Next: {summary['next_action']}")
    return "\n".join(lines)


def _workstream_state(workspace: Path, errors: list[str]) -> dict[str, Any]:
    state: dict[str, Any] = {
        "active": [],
        "complete": [],
        "needs_execution": [],
        "needs_review": [],
        "blocker": "",
    }
    directory = workspace / "workstreams"
    if directory.is_symlink() or not directory.is_dir():
        errors.append(f"Workstreams directory is missing or unsafe: {directory}")
        return state

    for workstream in sorted(directory.iterdir(), key=lambda item: item.name):
        if workstream.is_symlink() or not workstream.is_dir():
            continue
        status_path = workstream / "status.yaml"
        if not status_path.exists():
            continue
        try:
            status = read_yaml(status_path)
            if not isinstance(status, dict):
                raise ValueError("status.yaml must contain a mapping")
            title = str(status.get("title") or workstream.name)
            if str(status.get("status", "active")) == "complete":
                gate = check_workstream_completion(workspace, workstream.name)
                if gate.passed:
                    state["complete"].append(title)
                else:
                    errors.append(gate.issues[0])
                continue

            report = workstream / "report.md"
            if not report.is_file():
                state["active"].append(title)
                state["needs_execution"].append(title)
                continue
            gate = check_workstream_completion(workspace, workstream.name)
            blocking = next(
                (issue for issue in gate.issues if "blocking review" in issue.lower()),
                "",
            )
            if blocking and not state["blocker"]:
                state["active"].append(title)
                state["blocker"] = blocking
            elif gate.passed:
                state["complete"].append(title)
            elif any("missing a" in issue.lower() for issue in gate.issues):
                state["active"].append(title)
                state["needs_execution"].append(title)
            else:
                state["active"].append(title)
                state["needs_review"].append(title)
        except Exception as exc:
            errors.append(f"{workstream.name}: {exc}")
    return state


def _recent_update(workspace: Path, errors: list[str]) -> str:
    try:
        messages = read_messages(workspace)
    except Exception as exc:
        errors.append(f"messages.jsonl: {exc}")
        return ""
    for message in reversed(messages):
        if message.get("type") not in {"artifact", "decision", "review", "status"}:
            continue
        content = str(message.get("content", "")).strip()
        if content:
            return _short(content)
    return ""


def _goal_status(goal: object) -> str:
    return str(goal.get("status", "")) if isinstance(goal, Mapping) else ""


def _progress_text(
    *,
    approved: int,
    draft: int,
    active: int,
    complete: int,
    working_paper: bool,
) -> str:
    if working_paper:
        return "The working paper exists."
    if not any((approved, draft, active, complete)):
        return "No goals or workstreams have started."
    return (
        f"{approved} approved goals; {active} active and {complete} reviewed "
        "workstreams."
    )


def _short(value: str, limit: int = 180) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3].rstrip() + "..."

from __future__ import annotations

from importlib import resources
from pathlib import Path


SKILL_RELATIVE_PATH = Path(".agents/skills/co-mathematician/SKILL.md")

AGENTS_TEXT = """# Co-Math Project

This directory is a persistent mathematical research project.

1. Read `.agents/skills/co-mathematician/SKILL.md` before managing the project.
2. Run `co-math resume --project .` at the start of a session.
3. Keep durable research state under `workspace/`.
4. Do not start workstreams before the user approves their goals.
5. Keep failed attempts, uncertainty, and independent reviews visible.
"""

CLAUDE_TEXT = """# Claude Code Entry

Read and follow `AGENTS.md`, then read
`.agents/skills/co-mathematician/SKILL.md` before managing this project.
"""


def skill_text() -> str:
    resource = resources.files("harness.co_math.resources").joinpath(
        "co_mathematician_skill.md"
    )
    return resource.read_text(encoding="utf-8")


def write_project_agent_files(project_root: Path) -> Path:
    root = Path(project_root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Project root must be a directory, not a symlink: {root}")

    skill_path = root / SKILL_RELATIVE_PATH
    skill_path.parent.mkdir(parents=True, exist_ok=True)
    _write_regular_file(skill_path, skill_text())
    _write_regular_file(root / "AGENTS.md", AGENTS_TEXT)
    _write_regular_file(root / "CLAUDE.md", CLAUDE_TEXT)
    return skill_path


def _write_regular_file(path: Path, content: str) -> None:
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"Co-Math project file is not a regular file: {path}")
    path.write_text(content, encoding="utf-8")

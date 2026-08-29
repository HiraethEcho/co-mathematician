from __future__ import annotations

import json
import os
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .agent_skill import write_project_agent_files
from .workspace import init_workspace

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10
    import tomli as tomllib  # type: ignore[no-redef,import-not-found]


PROJECT_FILENAME = "co-math.toml"
ARCHIVE_FILENAME = "ARCHIVED.md"
DEFAULT_PROJECTS_HOME = Path.home() / "CoMathProjects"
_PROJECT_FIELDS = {"name", "workspace"}
_USER_CONFIG_FIELDS = {"projects_home"}
_INVALID_NAME_CHARACTERS = set('<>:"/\\|?*')
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


@dataclass(frozen=True)
class Project:
    root: Path
    workspace: Path
    name: str


def config_home() -> Path:
    configured = os.environ.get("CO_MATH_CONFIG_HOME")
    return (
        Path(configured).expanduser()
        if configured
        else Path.home() / ".config" / "co-math"
    )


def configure_projects_home(path: str | Path) -> Path:
    home = _prepare_projects_home(path)
    directory = config_home()
    if directory.is_symlink():
        raise ValueError(f"Co-Math config directory must not be a symlink: {directory}")
    directory.mkdir(parents=True, exist_ok=True)
    config_path = directory / "config.toml"
    _write_regular_file(
        config_path,
        f"projects_home = {_toml_string(str(home))}\n",
    )
    return home


def projects_home(path: str | Path | None = None) -> Path:
    if path is not None:
        return _normalized_path(path)

    config_path = config_home() / "config.toml"
    if not config_path.exists() and not config_path.is_symlink():
        return DEFAULT_PROJECTS_HOME.expanduser()
    data = _read_toml(config_path, _USER_CONFIG_FIELDS, "Co-Math config")
    value = data.get("projects_home")
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Co-Math config needs a projects_home path")
    return _normalized_path(value)


def create_project(
    name: str,
    *,
    projects_home_path: str | Path | None = None,
    initialize_git: bool = True,
) -> tuple[Project, bool]:
    checked_name = validate_project_name(name)
    home = _prepare_projects_home(projects_home(projects_home_path))
    root = home / checked_name
    if root.exists() or root.is_symlink():
        raise ValueError(f"Project directory already exists: {root}")

    root.mkdir()
    _write_project_config(root, checked_name)
    init_workspace(root / "workspace")
    write_project_agent_files(root)

    git_initialized = False
    if initialize_git:
        try:
            result = subprocess.run(
                ["git", "init", "-q", str(root)],
                check=False,
                capture_output=True,
                text=True,
            )
            git_initialized = result.returncode == 0
        except FileNotFoundError:
            git_initialized = False

    return read_project(root), git_initialized


def list_projects(projects_home_path: str | Path | None = None) -> list[Project]:
    home = projects_home(projects_home_path)
    if home.is_symlink():
        raise ValueError(f"Projects directory must not be a symlink: {home}")
    if not home.exists():
        return []
    if not home.is_dir():
        raise ValueError(f"Projects path must be a directory: {home}")

    found: list[Project] = []
    for child in sorted(home.iterdir(), key=lambda item: item.name.casefold()):
        if child.is_symlink() or not child.is_dir():
            continue
        if (child / PROJECT_FILENAME).is_file():
            found.append(read_project(child))
    return found


def resolve_project(path: str | Path | None = None) -> Project:
    candidate = Path.cwd() if path is None else Path(path).expanduser()
    if not candidate.exists():
        raise ValueError(f"Project path does not exist: {candidate}")
    if candidate.is_file():
        candidate = candidate.parent
    candidate = candidate.resolve(strict=True)
    for root in (candidate, *candidate.parents):
        config_path = root / PROJECT_FILENAME
        if config_path.exists() or config_path.is_symlink():
            return read_project(root)
    raise ValueError(f"No {PROJECT_FILENAME} found from {candidate}")


def read_project(root: str | Path) -> Project:
    project_root = Path(root).expanduser()
    if project_root.is_symlink() or not project_root.is_dir():
        raise ValueError(f"Project root must be a directory, not a symlink: {project_root}")
    project_root = project_root.resolve(strict=True)
    data = _read_toml(
        project_root / PROJECT_FILENAME,
        _PROJECT_FIELDS,
        "project config",
    )
    name = data.get("name")
    workspace_name = data.get("workspace")
    if not isinstance(name, str):
        raise ValueError("Project config needs a text name")
    checked_name = validate_project_name(name)
    if (
        not isinstance(workspace_name, str)
        or not workspace_name
        or Path(workspace_name).is_absolute()
        or Path(workspace_name).name != workspace_name
        or workspace_name in {".", ".."}
    ):
        raise ValueError("Project config needs a simple workspace directory name")

    workspace = project_root / workspace_name
    if workspace.is_symlink() or not workspace.is_dir():
        raise ValueError(f"Project workspace is missing or unsafe: {workspace}")
    resolved_workspace = workspace.resolve(strict=True)
    if resolved_workspace.parent != project_root:
        raise ValueError(f"Project workspace leaves its project directory: {workspace}")
    return Project(project_root, resolved_workspace, checked_name)


def archive_project(project: Project) -> Path:
    path = _archive_path(project)
    _write_regular_file(
        path,
        "# Archived Project\n\n"
        "This project is archived. Its research files remain unchanged.\n",
    )
    return path


def reopen_project(project: Project) -> None:
    path = _archive_path(project)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"Project archive file is unsafe: {path}")
    path.unlink(missing_ok=True)


def is_project_archived(project: Project) -> bool:
    path = _archive_path(project)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"Project archive file is unsafe: {path}")
    return path.is_file()


def validate_project_name(name: str) -> str:
    if not isinstance(name, str):
        raise ValueError("Project name must be text")
    normalized = unicodedata.normalize("NFKC", name).strip()
    if not normalized or normalized in {".", ".."}:
        raise ValueError("Project name must not be empty or dot-only")
    if len(normalized) > 120:
        raise ValueError("Project name must use at most 120 characters")
    if any(character in _INVALID_NAME_CHARACTERS for character in normalized):
        raise ValueError("Project name contains a path or platform-reserved character")
    if any(unicodedata.category(character) == "Cc" for character in normalized):
        raise ValueError("Project name contains a control character")
    if normalized.endswith((".", " ")):
        raise ValueError("Project name must not end with a dot or space")
    if normalized.split(".", 1)[0].upper() in _WINDOWS_RESERVED_NAMES:
        raise ValueError("Project name is reserved by the operating system")
    return normalized


def _prepare_projects_home(path: str | Path) -> Path:
    home = _normalized_path(path)
    if home.is_symlink():
        raise ValueError(f"Projects directory must not be a symlink: {home}")
    home.mkdir(parents=True, exist_ok=True)
    if home.is_symlink() or not home.is_dir():
        raise ValueError(f"Projects path must be a directory: {home}")
    return home.resolve(strict=True)


def _normalized_path(path: str | Path) -> Path:
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate


def _write_project_config(root: Path, name: str) -> Path:
    path = root / PROJECT_FILENAME
    _write_regular_file(
        path,
        f"name = {_toml_string(name)}\nworkspace = \"workspace\"\n",
    )
    return path


def _archive_path(project: Project) -> Path:
    directory = project.workspace / "project"
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Project state directory is missing or unsafe: {directory}")
    return directory / ARCHIVE_FILENAME


def _read_toml(path: Path, fields: set[str], label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{label.capitalize()} is missing or unsafe: {path}")
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except tomllib.TOMLDecodeError as exc:
        raise ValueError(f"Invalid {label}: {exc}") from exc
    if not isinstance(data, dict) or set(data) != fields:
        expected = ", ".join(sorted(fields))
        raise ValueError(f"{label.capitalize()} must contain only: {expected}")
    return data


def _write_regular_file(path: Path, content: str) -> None:
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"Co-Math file is not a regular file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)

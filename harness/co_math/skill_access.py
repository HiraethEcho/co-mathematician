"""Read standard local Skill packages for the web research interface."""
from __future__ import annotations

import os
import re
from urllib.parse import unquote
from pathlib import Path, PurePosixPath

from .skills import parse_skill


def within(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or "\\" in relative or "\0" in relative:
        raise ValueError("Skill 路径不正确")
    parts = PurePosixPath(relative).parts
    if not parts or PurePosixPath(relative).is_absolute() or any(part == ".." or part.startswith(".") or ":" in part for part in parts):
        raise ValueError("Skill 资源必须位于已接入的目录内")
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Skill 资源不能通过符号链接读取")
    if not current.resolve().is_relative_to(root.resolve()):
        raise ValueError("Skill 资源超出了接入目录")
    return current


def read_text(path: Path, maximum=32000) -> str:
    if not path.is_file() or path.is_symlink():
        raise ValueError("Skill 文件不存在或是符号链接")
    if path.stat().st_size > maximum:
        raise ValueError(f"文件超过 {maximum // 1000} KB，当前无法完整加载")
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def referenced_files(body: str, package: Path) -> list[str]:
    references = re.findall(r"(?<![\w:/])(?:\./)?((?:references|templates|assets)/[^\s`<>\]\)]+)", body)
    references += re.findall(r"\[[^\]\n]*\]\(([^\s\)]+)\)", body)
    for match in re.finditer(r"`([^`\n]+)`", body):
        candidate = match.group(1)
        if Path(candidate).suffix.lower() not in {".md", ".txt", ".tex"}:
            continue
        try:
            exists = within(package, candidate).is_file()
        except ValueError:
            exists = False
        line = body[body.rfind("\n", 0, match.start()) + 1:match.start()].lower()
        if exists or re.match(r"(?:agent_|skill_|SKILL\d)", Path(candidate).name) or re.search(r"read|start with|读取|阅读|参考", line):
            references.append(candidate)
    return [unquote(reference.split("#", 1)[0]).removeprefix("./").rstrip(".,;:") for reference in references if not re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", reference) and not reference.startswith("#")]


class SkillAccess:
    def __init__(self, directory, read_json, write_json):
        self.path = directory / "verymath-skills.json"
        self.write_json = write_json
        settings = read_json(self.path, {})
        self.library = settings.get("directory", "") if isinstance(settings, dict) else ""
        if not isinstance(self.library, str):
            raise ValueError("Skill 库目录配置无效")

    def connect(self, directory):
        if not isinstance(directory, str) or len(directory) > 4000:
            raise ValueError("请填写 Skill 库所在目录")
        if not directory.strip():
            self.write_json(self.path, {"directory": ""})
            self.library = ""
            return {"directory": ""}
        root = Path(directory).expanduser()
        if root.is_symlink() or not root.is_dir():
            raise ValueError("Skill 库目录不存在或是符号链接")
        if not (root / "SKILL.md").is_file() and (root / "skills").is_dir():
            root = within(root, "skills")
        root = root.resolve()
        entries, _, _ = self.scan(root, "verymath")
        if not entries:
            raise ValueError("这个目录中没有找到可读取的 SKILL.md")
        self.write_json(self.path, {"directory": str(root)})
        self.library = str(root)
        return {"directory": self.library, "count": len(entries)}

    def roots(self, project):
        result = {"project": project.root / ".agents" / "skills"}
        if self.library:
            result["verymath"] = Path(self.library)
        return result

    def scan(self, root, source):
        entries, errors = [], []
        if root.is_symlink() or not root.is_dir():
            return [], ["Skill 目录不存在或是符号链接"], False
        visited = 0
        for directory, folders, files in os.walk(root, followlinks=False):
            visited += 1
            folders[:] = [name for name in sorted(folders) if not name.startswith(".") and name not in {"node_modules", "__pycache__", "tests", "examples"} and not (Path(directory) / name).is_symlink()]
            if len(Path(directory).relative_to(root).parts) >= 8:
                folders.clear()
            if visited > 2000 or len(entries) >= 300:
                return entries, errors, True
            if "SKILL.md" not in files:
                continue
            path = Path(directory) / "SKILL.md"
            relative = path.relative_to(root).as_posix()
            try:
                body = read_text(within(root, relative))
                metadata, title = parse_skill(body)
                entries.append({"source": source, "path": relative, "name": metadata.get("name") or path.parent.name,
                                "title": title or path.parent.name, "description": metadata.get("description", ""),
                                "group": relative.split("/")[0] if source == "verymath" and "/" in relative else "项目 Skill"})
            except (ValueError, OSError) as exc:
                errors.append(f"{relative}：{exc}")
        return entries, errors, False

    def list(self, project):
        skills, warnings, truncated = [], [], False
        for source, root in self.roots(project).items():
            if source == "project" and (project.root / ".agents").is_symlink():
                warnings.append("项目的 .agents 目录是符号链接，未读取")
                continue
            found, errors, limited = self.scan(root, source)
            skills.extend(found); warnings.extend(errors); truncated = truncated or limited
        return {"directory": self.library, "skills": skills, "warnings": warnings, "truncated": truncated, "mode": "guidance"}

    def load(self, project, source, relative, directory=None):
        roots = self.roots(project)
        if source not in roots:
            raise ValueError("尚未接入这个 Skill 来源")
        if source == "verymath" and directory is not None and directory != self.library:
            raise ValueError("Skill 库位置已经变化，请重新选择 Skill")
        if source == "project" and (project.root / ".agents").is_symlink():
            raise ValueError("项目的 .agents 目录不能是符号链接")
        root = roots[source]
        if root.is_symlink() or not root.is_dir():
            raise ValueError("Skill 库目录当前不可用")
        path = within(root, relative)
        if path.name != "SKILL.md":
            raise ValueError("请选择标准的 SKILL.md")
        body = read_text(path)
        metadata, title = parse_skill(body)
        resources, warnings = [], []
        references = referenced_files(body, path.parent)
        budget = 12000
        seen = set()
        for reference in references:
            reference = reference.rstrip(".,;:")
            if reference in seen:
                continue
            seen.add(reference)
            if Path(reference).suffix.lower() not in {".md", ".txt", ".tex"}:
                warnings.append(f"未加载 {reference}：当前只读取 Markdown、文本和 LaTeX 参考说明")
                continue
            try:
                content = read_text(within(path.parent, reference))
                if len(resources) >= 8 or len(content) > budget:
                    warnings.append(f"未加载 {reference}：参考资料超过本轮文字容量")
                    continue
                resources.append({"path": reference, "content": content})
                budget -= len(content)
            except (ValueError, OSError) as exc:
                warnings.append(f"未加载 {reference}：{exc}")
        return {"source": source, "path": relative, "directory": str(root), "name": metadata.get("name") or path.parent.name,
                "title": title or path.parent.name, "description": metadata.get("description", ""), "instructions": body,
                "resources": resources, "warnings": warnings, "mode": "guidance"}

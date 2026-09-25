"""Small application interface for the local research workbench."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from uuid import uuid4

from .context import project_summary
from .project import config_home, create_project, projects_home, read_project
from .workspace import load_goals, save_goals


MAX_TEXT = 200_000
TEXT_SUFFIXES = {".md", ".txt", ".tex", ".yaml", ".yml", ".json", ".py", ".lean", ".csv"}


def now():
    return datetime.now(timezone.utc).isoformat()


def text(value, label, limit=MAX_TEXT):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{label}不能为空，且不能超过 {limit} 个字符")
    return value


def checked_path(root: Path, relative: str, *, create_parents=False):
    if not isinstance(relative, str) or "\\" in relative or "\0" in relative:
        raise ValueError("文件路径无效")
    parts = PurePosixPath(relative).parts
    if not parts or PurePosixPath(relative).is_absolute() or any(p in {"..", "."} or ":" in p for p in parts):
        raise ValueError("文件路径必须在项目内")
    current = root
    for index, part in enumerate(parts):
        current = current / part
        if current.is_symlink():
            raise ValueError("不读取或写入符号链接")
        if index < len(parts) - 1:
            if create_parents:
                current.mkdir(exist_ok=True)
            if not current.is_dir():
                raise ValueError("文件目录不存在")
    if not current.resolve().is_relative_to(root.resolve()):
        raise ValueError("文件路径超出项目")
    return current


def read_json(path, default):
    if path.is_symlink():
        raise ValueError("配置不能是符号链接")
    if not path.exists():
        return default
    if path.stat().st_size > 8_000_000:
        raise ValueError("记录文件过大，请在外部编辑器查看")
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    if path.is_symlink():
        raise ValueError("配置不能是符号链接")
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".writing-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class WebService:
    def __init__(self):
        self.home = projects_home(os.environ.get("CO_MATH_PROJECTS_HOME"))
        self.config = config_home()
        if self.config.is_symlink():
            raise ValueError("配置目录不能是符号链接")
        self.config.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.registry_file = self.config / "web-projects.json"
        self.registry = read_json(self.registry_file, {})
        if not isinstance(self.registry, dict):
            raise ValueError("网页项目列表格式错误")

    def discover(self):
        errors = []
        if self.home.is_symlink():
            raise ValueError("项目目录不能是符号链接")
        if self.home.exists():
            for path in sorted(self.home.iterdir()):
                if path.is_dir() and not path.is_symlink() and (path / "co-math.toml").exists():
                    try:
                        self.register(read_project(path))
                    except (ValueError, OSError) as exc:
                        errors.append({"name": path.name, "error": str(exc)})
        projects = []
        for pid, path in self.registry.items():
            try:
                project = read_project(path)
                projects.append({"id": pid, **project_summary(project)})
            except (ValueError, OSError) as exc:
                errors.append({"name": Path(path).name, "error": str(exc)})
        return {"projects": projects, "errors": errors, "home": str(self.home)}

    def register(self, project):
        path = str(project.root)
        for pid, existing in self.registry.items():
            if existing == path:
                return pid
        pid = uuid4().hex
        self.registry[pid] = path
        write_json(self.registry_file, self.registry)
        return pid

    def project(self, pid):
        if not isinstance(pid, str) or pid not in self.registry:
            raise ValueError("项目未打开，请先选择项目目录")
        return read_project(self.registry[pid])

    def conversation_path(self, project):
        return checked_path(project.root, ".co-math/web/conversation.json", create_parents=True)

    def conversation(self, project):
        value = read_json(self.conversation_path(project), {"messages": []})
        if not isinstance(value, dict) or not isinstance(value.get("messages"), list):
            raise ValueError("对话文件格式错误，原文件已保留")
        for index, message in enumerate(value["messages"]):
            message.setdefault("order", index)
        return value

    def allowed_file(self, project, relative):
        parts = PurePosixPath(relative).parts
        allowed = parts and (parts[0] == project.workspace.name or relative in {"AGENTS.md", "CLAUDE.md"} or parts[:2] == (".agents", "skills"))
        if not allowed or any(p.startswith(".") for p in parts[1:]) or Path(relative).suffix.lower() not in TEXT_SUFFIXES:
            raise ValueError("此文件不在可阅读的研究材料范围内")
        return checked_path(project.root, relative)

    def dispatch(self, method, params):
        if not isinstance(params, dict):
            raise ValueError("请求参数必须是对象")
        if method == "startup":
            result = self.discover()
            for item in result["projects"]:
                project = self.project(item["id"])
                try:
                    conversation = self.conversation(project)
                    changed = False
                    for message in conversation["messages"]:
                        if message.get("status") in {"running", "cancelling"}:
                            message.update(status="interrupted", error="服务已重启，已有文字保留；可以继续提问。")
                            changed = True
                    if changed:
                        write_json(self.conversation_path(project), conversation)
                except (ValueError, OSError) as exc:
                    result["errors"].append({"name": project.name, "error": str(exc)})
            return result
        if method == "project.list":
            return self.discover()
        if method == "project.create":
            question = params.get("question", "")
            language = params.get("language", "中文")
            if not isinstance(question, str) or len(question) > 20000 or language not in {"中文", "English"}:
                raise ValueError("问题或语言无效")
            project, _ = create_project(text(params.get("name"), "项目名称", 120), projects_home_path=self.home)
            introduction = f"# {project.name}\n\n## 研究问题\n\n{question or '待补充。'}\n\n## 文档语言\n\n{language}\n\n## 当前进展\n\n正在讨论问题，尚未形成经过审阅的结论。\n"
            (project.workspace / "project" / "PROJECT.md").write_text(introduction, encoding="utf-8")
            goals = load_goals(project.workspace)
            goals["research_question"]["text"] = question
            goals["language_policy"].update(status="chosen", project_docs_language=language, notes_language=language, final_output_language=language)
            save_goals(project.workspace, goals)
            pid = self.register(project)
            # Web conversation state is private application data, not research text.
            with (project.root / ".gitignore").open("a", encoding="utf-8") as handle:
                handle.write("\n.co-math/\n")
            return {"id": pid, **project_summary(project)}
        if method == "project.open":
            project = read_project(text(params.get("path"), "项目目录", 4000))
            return {"id": self.register(project), **project_summary(project)}

        project = self.project(params.get("projectId"))
        if method == "project.read":
            return {"id": params["projectId"], **project_summary(project)}
        if method == "file.list":
            found = []
            for start in [project.workspace, project.root / ".agents" / "skills"]:
                if start.is_symlink() or not start.exists():
                    continue
                try:
                    checked_path(project.root, start.relative_to(project.root).as_posix())
                except ValueError:
                    continue
                for directory, folders, files in os.walk(start, followlinks=False):
                    folders[:] = [f for f in sorted(folders) if not f.startswith(".") and not (Path(directory) / f).is_symlink()]
                    for filename in sorted(files):
                        path = Path(directory) / filename
                        if path.is_symlink() or path.suffix.lower() not in TEXT_SUFFIXES or filename.startswith("."):
                            continue
                        item = {"path": path.relative_to(project.root).as_posix(), "size": path.stat().st_size}
                        if path.suffix.lower() == ".md" and path.parent.name == "notes":
                            try:
                                with path.open(encoding="utf-8") as handle:
                                    heading = handle.readline(300).strip()
                                if heading.startswith("# "):
                                    item["title"] = heading[2:]
                            except UnicodeError:
                                pass
                        found.append(item)
                        if len(found) >= 1500:
                            return {"files": found, "truncated": True}
            return {"files": found, "truncated": False}
        if method == "file.read":
            relative = text(params.get("path"), "文件路径", 4000)
            path = self.allowed_file(project, relative)
            if not path.is_file() or path.stat().st_size > MAX_TEXT:
                raise ValueError("文件不存在或超过 200 KB，请用外部编辑器打开")
            return {"path": relative, "content": path.read_text(encoding="utf-8")}
        if method == "note.create":
            title = text(params.get("title"), "笔记标题", 200).replace("\n", " ")
            content = text(params.get("content"), "笔记内容")
            relative = f"{project.workspace.name}/project/notes/{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:8]}.md"
            path = checked_path(project.root, relative, create_parents=True)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(f"# {title}\n\n{content}\n")
            return {"path": relative, "content": path.read_text(encoding="utf-8")}
        if method == "chat.read":
            return self.conversation(project)
        if method == "chat.begin":
            content = text(params.get("content"), "问题", 20000)
            conversation = self.conversation(project)
            if len(conversation["messages"]) >= 500:
                raise ValueError("当前对话已达 500 条，请先在项目目录整理对话记录")
            position = len(conversation["messages"])
            run = {"id": uuid4().hex, "order": position + 1, "role": "assistant", "content": "", "status": "running", "createdAt": now(), "model": params["model"], "profileName": params.get("profileName", ""), "provider": params.get("provider", ""), "sources": params.get("sources", [])}
            conversation["messages"].extend([
                {"id": uuid4().hex, "order": position, "role": "user", "content": content, "createdAt": now()}, run,
            ])
            if len(json.dumps(conversation, ensure_ascii=False, indent=2).encode("utf-8")) > 7_000_000:
                raise ValueError("对话记录接近容量，请先在项目目录整理历史记录；本次问题尚未发送")
            write_json(self.conversation_path(project), conversation)
            return run
        if method == "chat.update":
            conversation = self.conversation(project)
            for message in conversation["messages"]:
                if message.get("id") == params.get("runId") and message.get("role") == "assistant":
                    for field in ("content", "status", "error"):
                        if field in params:
                            message[field] = params[field]
                    write_json(self.conversation_path(project), conversation)
                    return message
            raise ValueError("找不到对应回答")
        raise ValueError("不支持的操作")

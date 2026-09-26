"""Readable presentation of the existing goals file; no lifecycle changes."""
from __future__ import annotations

import yaml


def words(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def prose(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "\n".join(f"- {item.strip()}" for item in value if isinstance(item, str) and item.strip())
    return ""


def goals_document(content: str) -> dict:
    result = {"format": "goals", "title": "研究目标", "rawContent": content, "content": content, "readable": True}
    try:
        data = yaml.safe_load(content)
        if not isinstance(data, dict):
            raise ValueError("目标文件需要包含研究问题和目标列表")
        question = data.get("research_question", {})
        language = data.get("language_policy", {})
        goals = data.get("goals", [])
        if not isinstance(question, dict) or not isinstance(language, dict) or not isinstance(goals, list):
            raise ValueError("研究问题、语言或目标列表的格式需要检查")
        items = []
        for position, goal in enumerate(goals):
            if not isinstance(goal, dict):
                raise ValueError(f"第 {position + 1} 个目标的格式需要检查")
            details = []
            for key, label in [("description", "目标说明"), ("statement", "具体要求"), ("text", "目标内容"), ("assumptions", "假设条件"), ("success_criteria", "完成标准"), ("acceptance_criteria", "完成标准")]:
                value = prose(goal.get(key))
                if value:
                    details.append({"label": label, "content": value})
            items.append({"id": words(goal.get("id")) or str(position + 1), "title": words(goal.get("title")) or f"目标 {position + 1}", "status": words(goal.get("status")), "details": details})
        result["goalsView"] = {
            "question": words(question.get("text")), "questionStatus": words(question.get("status")),
            "language": words(language.get("project_docs_language")) or words(language.get("notes_language")), "goals": items,
        }
        # Model context gets decoded text too. The exact source stays in rawContent.
        result["content"] = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    except (yaml.YAMLError, ValueError):
        result["note"] = "研究目标暂时无法解析。原文件已保留，可展开下方的原始配置查看。"
    return result

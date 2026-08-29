# Agent-Neutral Project Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent independent Co-Math projects that any repository-aware coding agent can operate through one project-local Agent Skill and the `co-math` command.

**Architecture:** Co-Math stores only a small project configuration beside the existing `workspace/`. The configured projects directory is scanned when listing projects, so no registry is needed. Each project receives the same packaged Skill under `.agents/skills`, a short `AGENTS.md`, and a minimal Claude compatibility pointer.

**Tech Stack:** Python 3.10+, argparse, pathlib, PyYAML, TOML reading, setuptools package data, Git CLI.

**Spec:** `docs/superpowers/specs/2026-08-29-lightweight-project-lifecycle-main-integration.md`

## Global Constraints

- Do not add file identity, approval identity, completion bundles, generated adapters, or copied harness versions.
- Do not add a test directory, test dependency, JSON Schema, or substitute project flow.
- Keep `.agents/skills/co-mathematician/SKILL.md` as the only full project Skill.
- Do not require a platform-specific coding-agent tool.
- Do not force-push either repository.

---

### Task 1: Canonical Agent Skill And Project Files

**Files:**
- Create: `harness/co_math/resources/__init__.py`
- Create: `harness/co_math/resources/co_mathematician_skill.md`
- Create: `harness/co_math/agent_skill.py`
- Modify: `.agents/skills/co-mathematician/SKILL.md`
- Modify: `pyproject.toml`

**Interfaces:**
- Produces: `skill_text() -> str`
- Produces: `write_project_agent_files(project_root: Path) -> Path`

- [ ] **Step 1: Add the concise canonical Skill resource**

The Skill must explain `new`, `list`, `resume`, `next`, `archive`, and `reopen`, then defer research state changes to the existing workspace files and commands. It must tell the coding agent not to start research in the creation conversation.

- [ ] **Step 2: Add the project agent-file writer**

Implement `write_project_agent_files()` so it writes the canonical Skill to `.agents/skills/co-mathematician/SKILL.md`, a short root `AGENTS.md`, and a short `CLAUDE.md` that points to `AGENTS.md`. It must not write platform-specific agent definitions.

- [ ] **Step 3: Make the source repository Skill a pointer**

Replace the full root Skill body with a short instruction to read `harness/co_math/resources/co_mathematician_skill.md`. This keeps one full Skill source.

- [ ] **Step 4: Package the canonical Skill**

Declare the Markdown resource as setuptools package data, set the existing package's actual Python floor to 3.10, and add the TOML reader dependency only for Python versions without `tomllib`.

- [ ] **Step 5: Verify the resource boundary**

Run:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=. python3 -c "from harness.co_math.agent_skill import skill_text; assert 'name: co-mathematician' in skill_text(); print('canonical skill: ok')"
```

Expected: `canonical skill: ok`.

### Task 2: Independent Project Lifecycle

**Files:**
- Create: `harness/co_math/project.py`
- Modify: `harness/co_math/cli.py`

**Interfaces:**
- Produces: `Project(root: Path, workspace: Path, name: str)`
- Produces: `configure_projects_home(path: str | Path) -> Path`
- Produces: `create_project(name: str, projects_home: str | Path | None, initialize_git: bool) -> tuple[Project, bool]`
- Produces: `list_projects(projects_home: str | Path | None) -> list[Project]`
- Produces: `resolve_project(path: str | Path | None) -> Project`
- Produces: `archive_project(project: Project) -> Path`
- Produces: `reopen_project(project: Project) -> None`

- [ ] **Step 1: Add small user and project configuration readers**

Use `~/.config/co-math/config.toml` for only `projects_home`. Use `co-math.toml` for only `name` and `workspace`. Reject symlinks, missing workspaces, path traversal, invalid project names, and unexpected configuration fields.

- [ ] **Step 2: Add project creation and discovery**

Create a project under the configured home, call the existing `init_workspace()`, write the agent files, and initialize Git unless `--no-git` is supplied. List projects by scanning direct child directories for valid `co-math.toml` files.

- [ ] **Step 3: Add archive state**

Archive by writing `workspace/project/ARCHIVED.md`. Reopen by removing only that file. Never delete research files.

- [ ] **Step 4: Add CLI commands**

Add `setup`, `new`, `list`, `status`, `resume`, `next`, `archive`, and `reopen`. Every command accepts `--json` where structured output helps coding agents; project commands accept `--project` and otherwise discover from the current directory.

- [ ] **Step 5: Verify command parsing and project discovery**

Run direct Python assertions that parse each command and read the source repository's existing workspace without modifying it. Expected: all command parsers return their requested command names and invalid paths fail with a plain error.

### Task 3: Concise Context And Next Action

**Files:**
- Create: `harness/co_math/context.py`
- Modify: `harness/co_math/cli.py`

**Interfaces:**
- Consumes: `Project` from Task 2
- Produces: `project_summary(project: Project) -> dict[str, object]`
- Produces: `render_resume(summary: Mapping[str, object]) -> str`
- Produces: `render_next(summary: Mapping[str, object]) -> str`

- [ ] **Step 1: Read current workspace state**

Read `GOALS.yaml`, workstream `status.yaml` files, recent project messages, final output presence, and archive state. Keep parsing errors visible as the first blocker.

- [ ] **Step 2: Derive one next action**

Use this order: repair invalid files, reopen archived project, finish onboarding, address a blocking review, continue an active workstream, review a report, create work for an approved goal, approve draft goals, render the final paper, or archive a finished project.

- [ ] **Step 3: Keep human output short**

`resume` prints project name, research question, progress, optional recent update, optional blocker, one next action, and path. `next` prints current state, optional blocker, and one action. Structured output contains the same fields without internal gate names.

- [ ] **Step 4: Verify against existing workspace files**

Construct a `Project` pointing to the repository's existing `workspace/`, call `project_summary()`, and assert that the output contains `name`, `progress`, `blocker`, and `next_action` without writing files.

### Task 4: User Documentation And Packaging

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: CLI commands from Tasks 2 and 3
- Produces: Copyable generic coding-agent and terminal workflows

- [ ] **Step 1: Document the zero-to-project flow**

Show installation, `co-math setup`, `co-math new`, opening the returned directory in any coding agent, continuing with `resume` or `next`, and creating a second project without clearing the first.

- [ ] **Step 2: Explain Agent Skills discovery accurately**

State that `.agents/skills` is the canonical project Skill location, while `AGENTS.md` and the short Claude pointer provide compatibility for clients that do not scan it directly.

- [ ] **Step 3: Remove newly obsolete OpenCode-first wording**

Keep OpenCode as one example alongside Codex, Claude Code, and Cursor. Do not require an OpenCode installer or custom TypeScript tool.

- [ ] **Step 4: Build and inspect the wheel**

Build with `python3 -m pip wheel --no-deps --no-build-isolation` into `/private/tmp` and inspect the archive listing. Expected: the wheel contains `co_mathematician_skill.md` and all new Python modules.

- [ ] **Step 5: Run final source checks**

Run Python imports, CLI help, `git diff --check`, and a scan of added lines for prohibited mechanisms. Do not run or add pytest.

### Task 5: Main Branch Integration

**Files:**
- Modify only merge state and Git references after Tasks 1-4 are complete.

**Interfaces:**
- Consumes: verified canonical tree on `codex/main-lifecycle-integration`
- Produces: normally advanced `main` branches in both repositories

- [ ] **Step 1: Commit the implementation in focused commits**

Commit the Skill/project lifecycle, context/CLI, and documentation/package changes separately when the file boundaries permit it.

- [ ] **Step 2: Re-fetch both remote main branches**

Stop if either remote changed in a way that is not already included in the integration branch.

- [ ] **Step 3: Push ConanXu-math main normally**

Push `codex/main-lifecycle-integration:main` only if the fetched `origin/main` is an ancestor. Do not use force options.

- [ ] **Step 4: Bridge VeryMath history without replacing it**

Create a branch from the fetched `verymath/main`, merge the canonical integration history with unrelated histories explicitly retained, and update the resulting tree to the canonical verified tree. Confirm both parent histories are reachable before pushing normally to `verymath/main`.

- [ ] **Step 5: Verify remote results**

Read both remote `main` heads, verify each contains its previous main, and compare the final Git trees. Expected: both trees match and both pushes are fast-forward updates from their respective previous heads.

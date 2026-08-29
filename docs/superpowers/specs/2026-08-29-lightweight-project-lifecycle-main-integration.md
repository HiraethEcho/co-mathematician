# Lightweight Project Lifecycle Main Integration

## Goal

Keep Co-Math installed once while each mathematical project lives in its own
long-lived directory and optional Git repository. Users of repository-aware
coding agents should be able to create, find, continue, archive, and reopen
projects without learning the internal workspace states.

## Scope

- Add `new`, `list`, `status`, `resume`, `next`, `archive`, and `reopen`.
- Keep only a small `co-math.toml` project configuration and the existing
  `workspace/` files in each project.
- Discover projects by scanning the configured projects directory instead of
  maintaining a separate project registry.
- Put one canonical project Skill at
  `.agents/skills/co-mathematician/SKILL.md` in every created project.
- Use a short `AGENTS.md` as the coding-agent-neutral entry point. Keep only a
  short `CLAUDE.md` pointer for agents that do not read `.agents/skills` or
  `AGENTS.md` directly.
- Show the research question, progress, first blocker, and one next action in
  plain language.
- Document terminal and coding-agent usage in English and Chinese.

## Boundaries

- Do not restore the old branch's file identity, approval identity, completion
  bundle, generated adapter, or copied project-template systems.
- Do not add a test directory, test dependency, or substitute project flow.
- Do not start research while creating a project.
- Archiving only adds `workspace/project/ARCHIVED.md`; it never deletes research
  files.
- Do not require an OpenCode, Codex, Claude Code, or Cursor-specific tool.

## Components

`project.py` owns the small project configuration, project discovery, creation,
and archive state. It calls the existing workspace initializer rather than
copying a second version of the harness.

`context.py` reads existing project files and converts them into a short status
and next action. It does not mutate research state.

The packaged canonical Skill describes both project lifecycle commands and the
research workflow. Project creation copies that one Skill into `.agents/skills`
and writes short agent entry files. Every coding agent delegates project state
changes to the same `co-math` command.

## Repository Integration

`ConanXu-math/main` is the canonical source because it contains the current
simplified harness. The feature is implemented there as normal commits.

`VeryMath/main` has unrelated history. After the canonical change is verified,
create one explicit history bridge and update its tree to the canonical source.
Both pushes must be normal fast-forward pushes from each remote's current main;
no force push is allowed.

## Verification

- Import the Python modules and parse every new command.
- Run read-only commands against the current configured project directory.
- Build the Python wheel and confirm it contains the canonical Skill.
- Inspect the packaged Skill and project agent-file writer without creating a
  substitute research project.
- Check both README command sequences against the actual CLI help.
- Confirm both remote main heads and final repository trees after pushing.

Real coding-agent GUI interaction remains a separate manual check unless a
configured client is available during this work.

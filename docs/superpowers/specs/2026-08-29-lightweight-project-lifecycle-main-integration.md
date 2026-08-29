# Lightweight Project Lifecycle Main Integration

## Goal

Keep Co-Math installed once while each mathematical project lives in its own
long-lived directory and optional Git repository. OpenCode GUI users should be
able to create, find, continue, archive, and reopen projects without learning
the internal workspace states.

## Scope

- Add `new`, `list`, `status`, `resume`, `next`, `archive`, and `reopen`.
- Keep only a small `co-math.toml` project configuration and the existing
  `workspace/` files in each project.
- Discover projects by scanning the configured projects directory instead of
  maintaining a separate project registry.
- Install one global OpenCode Skill, one project-management tool, a runner, and
  a small local configuration file.
- Show the research question, progress, first blocker, and one next action in
  plain language.
- Document terminal and OpenCode GUI usage in English and Chinese.

## Boundaries

- Do not restore the old branch's file identity, approval identity, completion
  bundle, generated adapter, or copied project-template systems.
- Do not add a test directory, test dependency, or substitute project flow.
- Do not start research while creating a project.
- Archiving only adds `workspace/project/ARCHIVED.md`; it never deletes research
  files.
- OpenCode may only manage projects under the configured project roots.

## Components

`project.py` owns the small project configuration, project discovery, creation,
and archive state. It calls the existing workspace initializer rather than
copying a second version of the harness.

`context.py` reads existing project files and converts them into a short status
and next action. It does not mutate research state.

`opencode.py` installs fixed Co-Math files under the user's OpenCode directory.
Reinstalling replaces only those fixed files; uninstalling removes only those
fixed files.

The OpenCode Skill chooses sensible defaults and keeps replies short. The single
tool delegates all file-changing operations to the `co-math` command.

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
- Compile the OpenCode TypeScript files.
- Build the Python wheel and confirm it contains the Skill and OpenCode files.
- Check both README command sequences against the actual CLI help.
- Confirm both remote main heads and final repository trees after pushing.

Real OpenCode GUI interaction remains a separate manual check unless OpenCode is
available and configured during this work.

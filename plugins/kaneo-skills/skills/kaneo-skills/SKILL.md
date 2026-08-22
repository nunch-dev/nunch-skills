---
name: kaneo-skills
description: Turn one or more natural-language work items into well-scoped Korean Kaneo Todo issues, selecting the right workspace and project, checking duplicates, and creating subtasks when needed. Use when the user asks to issuerize, register, add, or create work in Kaneo; do not use for merely discussing work or browsing Kaneo without a creation request.
---

# Kaneo Skills

Create useful Kaneo issues with as little interruption as correctness permits. The user's request to register or issuerize work authorizes creation only along the clear path below; it does not authorize guessing through ambiguity.

## Clear path

Proceed without a preview or extra approval only when all of these are true:

- exactly one accessible workspace exists;
- exactly one existing project is an evident semantic match;
- the input represents one independently completable issue and does not need subtasks;
- no plausibly duplicate issue exists in that project; and
- the target project has a Todo column.

If any condition is false or uncertain, pause before mutation and ask the user one focused question that resolves the current ambiguity. Do not bundle unrelated decisions into the same question.

## Resolve the destination

1. Use Kaneo MCP to identify the signed-in context and list accessible workspaces.
2. If more than one workspace exists, ask the user to select one. Do not choose a default.
3. List the workspace's non-archived projects. Match the work item semantically against project names and available descriptions; do not rely on keyword overlap alone.
4. If one existing project is clearly correct, use it. If none or several fit, show the relevant candidates and ask whether to use an existing project or create a new one.
5. When the user chooses a new project, propose the name, slug, and icon required by Kaneo and get that proposal confirmed before creating it.
6. List the selected project's columns and use the actual slug of the column named Todo. If no Todo column exists or more than one could qualify, ask the user before creating any issue.

## Shape the issue

- Treat a work item as one issue only when it has one independently completable outcome.
- If it contains multiple outcomes, phases, owners, or separately verifiable tasks, propose an understandable parent/subtask structure and let the user confirm or revise it before creation.
- Write a concise Korean title that names the observable work or problem.
- Write a Korean description that preserves every supplied fact and makes the context, intended outcome, and useful details easy to understand. Do not invent requirements or acceptance criteria.
- If the Korean draft has obvious translationese or AI-style phrasing and `$humanize-korean` is available, invoke it conservatively. Preserve facts, numbers, dates, names, and intent. Skip it when the draft is already natural.

## Resolve fields

- Preserve an explicitly supplied priority. Otherwise use `no-priority`; do not ask merely because priority is absent.
- Preserve an explicitly supplied due date. Otherwise omit it; do not ask merely because it is absent.
- Assign a user only when the request explicitly names an assignee. Resolve the name through workspace members; ask if it matches zero or multiple members. Otherwise leave the issue unassigned.
- Apply the selected project's actual Todo status slug to every created parent and subtask.

## Check duplicates

After the project and proposed issue structure are known, search existing tasks in that project before creating anything.

- Search with the proposed title and the input's distinguishing nouns.
- Inspect plausible matches for the same underlying problem or outcome, even when wording differs.
- If any result could be a duplicate, show the candidate and ask whether to create a new issue, reuse the existing issue, or revise the proposal.
- Continue automatically only when no plausible duplicate remains.

## Create and report

Create the parent before its children. Create each child as a normal Todo task, then connect it with a `subtask` relation where the parent is the source and the child is the target. Stop on a failed creation or relation call and report exactly what succeeded; do not retry mutations blindly.

After creation, report:

- workspace and project;
- every created issue's title and Kaneo identifier;
- Todo status and any parent/subtask relationships;
- assigned priority, due date, and assignee when present; and
- an explicit notice for each omitted priority or due date.

Do not describe a requested issue as created unless the Kaneo tool returned a successful result.

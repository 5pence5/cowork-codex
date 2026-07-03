---
name: codex-prompting
description: Compose precise Cowork Codex prompts for implementation, research, diagnosis, and review handoffs
user-invocable: false
---

# Codex Prompting

Use this skill before handing a non-trivial task to Cowork Codex through `/delegate` or `codex_start_task`.

The guidance is model-neutral and intended for current Codex models, including GPT-5.5. Do not hard-code a model or effort level unless the user asks. Improve the prompt contract first; only escalate model or effort when the task genuinely needs it.

## Core Rules

- Send one clear job per Codex run. Split unrelated research, review, implementation, and roadmap work into separate jobs.
- Prompt Codex like an operator. State the task, scope, done condition, output contract, and follow-through defaults.
- Prefer compact XML-style blocks for substantial prompts because they make routing and output expectations stable.
- Add verification rules for implementation, diagnosis, and risky fixes.
- Add grounding and citation rules for research, review, and claims that could otherwise become unsupported.
- For write-capable tasks, state the allowed workspace and tell Codex to keep changes narrow.
- For follow-ups, use resume when the new instruction continues the same Codex thread; send only the delta unless the direction changed materially.

## Default Shape

Use only the blocks the task needs:

```xml
<task>
Describe the concrete job, relevant repo or research context, and expected end state.
</task>

<structured_output_contract>
Return:
1. outcome
2. evidence
3. changed files or sources inspected
4. verification performed
5. residual risks or open questions
</structured_output_contract>

<default_follow_through_policy>
Default to the most reasonable low-risk interpretation and keep going.
Only stop for missing details that materially change correctness or would cause broad or irreversible changes.
</default_follow_through_policy>
```

## Add Blocks By Task Type

- Implementation or debugging: add `completeness_contract`, `verification_loop`, and `action_safety`.
- Research or recommendation: add `research_mode`, `grounding_rules`, and `citation_rules`.
- Review or critical review: prefer `/review` or `/critical-review`; add focus text rather than replacing the built-in review contract.
- Long-running work: add `progress_updates` and run in the background.

## Cowork Handoff Rules

- Preserve the user's actual objective. Tighten the prompt, but do not silently change the task.
- Include the target cwd or workspace context in the task text when it is not obvious.
- If the task is inspection-only, request `read-only`; otherwise use the default `workspace-write`.
- Do not ask Codex to coordinate with Cowork's editor state. Avoid overlapping write-capable jobs on the same files.
- For multiple parallel lanes, give each Codex job a distinct scope and output contract.
- Return Codex final output verbatim unless the user asks for a summary.

## References

- [Prompt blocks](references/prompt-blocks.md)
- [Prompt recipes](references/prompt-recipes.md)
- [Prompt anti-patterns](references/prompt-antipatterns.md)

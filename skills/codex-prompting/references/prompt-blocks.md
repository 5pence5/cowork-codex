# Prompt Blocks

Use these blocks selectively. Do not include every block by default.

## `task`

```xml
<task>
State the concrete job, the relevant repo or research context, and the expected end state.
</task>
```

## `structured_output_contract`

```xml
<structured_output_contract>
Return:
1. highest-value result first
2. evidence or sources inspected
3. changes made, if any
4. verification performed
5. residual risks or open questions
</structured_output_contract>
```

## `compact_output_contract`

```xml
<compact_output_contract>
Keep the final answer concise and decision-useful.
Avoid long setup, repeated recap, and speculative filler.
</compact_output_contract>
```

## `default_follow_through_policy`

```xml
<default_follow_through_policy>
Default to the most reasonable low-risk interpretation and keep going.
Only stop for missing details that materially change correctness or would cause broad or irreversible changes.
</default_follow_through_policy>
```

## `completeness_contract`

```xml
<completeness_contract>
Finish the task end to end before stopping.
Do not stop at diagnosis if the user asked for an implementation.
Check for follow-on fixes, edge cases, and cleanup needed for correctness.
</completeness_contract>
```

## `verification_loop`

```xml
<verification_loop>
Before finalizing, verify the result against the task requirements and the relevant files, tests, or source outputs.
If a check fails, revise the work instead of reporting the first attempt.
</verification_loop>
```

## `grounding_rules`

```xml
<grounding_rules>
Ground claims in repository evidence, tool outputs, or inspected sources.
Do not present inferences as facts.
Label hypotheses and unresolved uncertainty clearly.
</grounding_rules>
```

## `citation_rules`

```xml
<citation_rules>
For research claims, cite the sources or file paths inspected.
Prefer primary sources where available.
If live research was not available or not used, say what evidence the answer is based on.
</citation_rules>
```

## `research_mode`

```xml
<research_mode>
Separate observed facts, reasoned inferences, and open questions.
Start broad enough to avoid tunnel vision, then go deeper where the evidence changes the recommendation.
</research_mode>
```

## `action_scope`

```xml
<action_scope>
Keep changes tightly scoped to the stated task.
Avoid unrelated refactors, renames, formatting churn, or cleanup unless required for correctness.
Call out broad or irreversible actions before taking them.
</action_scope>
```

## `progress_updates`

```xml
<progress_updates>
For long-running jobs, provide brief outcome-based updates at major phase changes or blockers.
Do not stream low-value narration.
</progress_updates>
```

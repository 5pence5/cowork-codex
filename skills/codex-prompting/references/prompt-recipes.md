# Prompt Recipes

Use these as starting points. Copy the smallest recipe that fits and trim anything unnecessary.

## Diagnosis

```xml
<task>
Diagnose why the failing command, test, or workflow is breaking in this repository.
Use repository evidence and tool outputs to identify the most likely root cause.
</task>

<structured_output_contract>
Return:
1. most likely root cause
2. evidence
3. smallest safe next step
4. checks still needed, if any
</structured_output_contract>

<default_follow_through_policy>
Keep going until you have enough evidence to identify the root cause confidently.
Only stop when missing context materially changes correctness.
</default_follow_through_policy>

<grounding_rules>
Do not guess repository facts.
State exactly what evidence supports the diagnosis.
</grounding_rules>
```

## Narrow Implementation

```xml
<task>
Implement the smallest safe fix for the stated issue in this repository.
Preserve behavior outside the requested path.
</task>

<structured_output_contract>
Return:
1. summary of the change
2. touched files
3. verification performed
4. residual risks or follow-ups
</structured_output_contract>

<completeness_contract>
Resolve the task fully before stopping.
Do not stop after identifying the issue without applying the fix.
</completeness_contract>

<verification_loop>
Before finalizing, run or explain the most relevant checks for the changed behavior.
</verification_loop>

<action_safety>
Keep edits tightly scoped.
Avoid unrelated refactors, renames, formatting churn, or cleanup.
</action_safety>
```

## Research

```xml
<task>
Research the available options and recommend the best path for this task.
Use the available sources and clearly separate evidence from inference.
</task>

<structured_output_contract>
Return:
1. observed facts
2. recommendation
3. tradeoffs
4. open questions
</structured_output_contract>

<research_mode>
Start broad enough to avoid tunnel vision, then go deeper where evidence changes the recommendation.
</research_mode>

<citation_rules>
Cite the sources or files inspected for important claims.
Prefer primary sources where available.
</citation_rules>
```

## Follow-Up On Existing Codex Thread

```xml
<task>
Continue the existing Codex thread with this delta instruction:
[state only what changed or what to do next]
</task>

<compact_output_contract>
Return only the new outcome, changed files or sources inspected, and verification.
</compact_output_contract>
```

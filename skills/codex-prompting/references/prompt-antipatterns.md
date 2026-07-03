# Prompt Anti-Patterns

Avoid these when handing work to Cowork Codex.

## Vague Task Framing

Bad:

```text
Take a look and tell me what you think.
```

Better:

```xml
<task>
Review this change for material correctness and regression risks.
</task>
```

## Missing Output Contract

Bad:

```text
Investigate and report back.
```

Better:

```xml
<structured_output_contract>
Return:
1. root cause
2. evidence
3. smallest safe next step
</structured_output_contract>
```

## Mixing Unrelated Jobs

Bad:

```text
Research the design, fix the bug, update docs, and suggest a roadmap.
```

Better:

- Run research first.
- Run a separate implementation prompt if needed.
- Run a third docs or roadmap prompt after the direction is settled.

## Asking For More Thinking Instead Of A Better Contract

Bad:

```text
Think harder and be very smart.
```

Better:

```xml
<verification_loop>
Before finalizing, verify that the answer matches the observed evidence and task requirements.
</verification_loop>
```

## Unsupported Certainty

Bad:

```text
Tell me exactly why this failed.
```

Better:

```xml
<grounding_rules>
Ground every claim in inspected evidence.
If a point is a hypothesis, label it clearly.
</grounding_rules>
```

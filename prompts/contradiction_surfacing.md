# Prompt: Contradiction Surfacing

**Pass 4 of 4** — Find tensions, contradictions, and unresolved conflicts between claims.

---

## INPUT

Paste all three prior outputs:
1. Claims JSON array (Pass 1)
2. Evidence JSON array (Pass 2)
3. Confidence JSON array (Pass 3)

---

## INSTRUCTION

You are looking for structural tensions in the paper's argument. A linear reading often hides these because each section is locally coherent. Your job is to read across the full claim set and find places where claims are in tension with each other, where the confidence levels are inconsistent with how the paper uses the claims, or where a low-evidence claim is doing load-bearing structural work.

Look for four types of tension:

**1. Direct contradiction** — Claim A and Claim B cannot both be true as stated. One of them must be wrong, or both are using a term differently.

**2. Evidential inconsistency** — Claim A is used to support Claim B, but Claim A has low confidence. The chain of reasoning breaks at a weak link.

**3. Scope creep** — A claim established for a narrow case (e.g., in a specific dataset, or with a specific population) is later invoked as if it applies generally. The paper moves from limited to general without acknowledging the gap.

**4. Hidden assumption** — Claim B follows from Claim A only if an unstated third claim is true. The paper doesn't state this third claim, which means readers may disagree about whether the inference is valid even if they accept both A and B.

For each tension you find:

- Name the two (or more) claims involved
- Classify the tension type
- Describe the tension in two to four sentences
- Assess severity: `critical` (paper's main conclusion depends on resolving this) / `moderate` (affects a secondary argument) / `minor` (doesn't affect the main thrust)
- Suggest what a reader would need to resolve it: additional data, a clarified definition, an explicit scope limitation, etc.

If you find no genuine tensions, say so explicitly. Do not manufacture conflicts to fill the output. A paper with internally consistent claims is a good outcome.

---

## OUTPUT FORMAT

```json
[
  {
    "tension_id": "T01",
    "claims_involved": ["C03", "C07"],
    "tension_type": "direct_contradiction | evidential_inconsistency | scope_creep | hidden_assumption",
    "description": "Two to four sentences describing the specific tension. Name the exact claims and what makes them conflict.",
    "severity": "critical | moderate | minor",
    "resolution_path": "What would a reader need to see to consider this resolved — additional data, definition, scope statement, etc."
  }
]
```

If no genuine tensions found:
```json
{
  "result": "no_tensions_found",
  "note": "Brief explanation of why the claims are internally consistent."
}
```

---

## After this pass

You now have four JSON outputs covering the full paper section:
- Claims with type and load-bearing flags
- Evidence with type and strength per claim
- Confidence scores with uncertainty sources
- Tensions and contradictions

Use these to build your mindmap structure. Each load-bearing claim becomes a top-level node. Evidence and confidence become child nodes or notes. Tensions become relation arrows connecting conflicting nodes.

The `examples/` folder shows a worked example of this mapping using Anthropic's Constitutional AI paper.

---

*Part of the [agentic-mindmap](https://github.com/EskilXu/agentic-mindmap) paper-reading workflow.*

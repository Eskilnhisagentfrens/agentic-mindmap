# Prompt: Confidence Scoring

**Pass 3 of 4** — Assess how confident you should be in each claim, given the evidence.

---

## INPUT

Paste the outputs from both Pass 1 and Pass 2:
1. Claims JSON array (`claims_extraction.md` output)
2. Evidence JSON array (`evidence_pass.md` output)

---

## INSTRUCTION

You are performing a calibrated confidence assessment. For each claim, you have the claim itself and the evidence the paper offers. Your job is to give a confidence score that reflects how well the evidence actually supports the claim — not how confident the paper's authors sound.

For each claim, assess:

1. **Confidence score**: a number from 0.0 to 1.0
   - `0.9–1.0`: Near-certain — strong direct evidence, well-controlled, replicated or formally proven
   - `0.7–0.9`: High confidence — good evidence with minor caveats
   - `0.5–0.7`: Moderate — evidence is suggestive but incomplete, or the methodology has notable limitations
   - `0.3–0.5`: Low confidence — weak evidence, heavy reliance on analogy or cited prior work that may not transfer
   - `0.0–0.3`: Very low — claim made with minimal or no evidence in this paper

2. **Primary uncertainty source** — what is the main thing you don't know that limits confidence:
   - `sample_size` — study is underpowered or results from small N
   - `generalizability` — results may not transfer to other settings
   - `methodology` — approach has known weaknesses for this type of claim
   - `no_evidence` — claim is not supported in the paper
   - `replication` — single study, not independently verified
   - `operationalization` — the paper's definition of the key term may not match how it's used in the claim
   - `none` — confidence is high; no significant uncertainty source identified

3. **Reasoning**: one to three sentences explaining the score. Be specific. Do not just restate the claim or the evidence — say why the evidence does or does not support the claim at the level of confidence assigned.

4. **Over-claim flag** (`true`/`false`): Is the paper's framing of this claim stronger than the evidence warrants? Flag `true` if the paper uses language like "demonstrates", "proves", or "shows" for a claim where the evidence only warrants "suggests" or "is consistent with."

**Calibration note**: Err on the side of lower confidence. A claim that turns out to be true but was flagged as uncertain costs nothing. A claim that turns out to be false but was marked as high-confidence is the failure mode this workflow exists to prevent.

---

## OUTPUT FORMAT

```json
[
  {
    "claim_id": "C01",
    "confidence": 0.75,
    "uncertainty_source": "generalizability | sample_size | methodology | no_evidence | replication | operationalization | none",
    "reasoning": "One to three sentences explaining the score. Specific, not generic.",
    "over_claim": false
  }
]
```

---

*Part of the [agentic-mindmap](https://github.com/EskilXu/agentic-mindmap) paper-reading workflow.*

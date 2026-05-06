# Prompt: Evidence Pass

**Pass 2 of 4** — For each claim from Pass 1, extract the evidence the paper offers in support.

---

## INPUT

Paste two things:

1. The claims JSON array from Pass 1 (`claims_extraction.md`)
2. The paper section text (same section you ran Pass 1 on)

---

## INSTRUCTION

You are examining the relationship between claims and evidence in an academic paper. You have a list of extracted claims. For each claim, find what evidence or reasoning the paper offers in its support *within this section*.

For each piece of evidence:

1. Quote or closely paraphrase the relevant text (keep it short — one to three sentences)
2. Classify the evidence type:
   - `direct_data` — a number, table, figure, or experiment result from this paper
   - `logical_derivation` — the paper argues this follows logically from other claims
   - `analogy` — the paper reasons by comparison to a different case
   - `cited_prior_work` — the paper points to an external source for support
   - `definition_by_fiat` — the claim is true because the paper defines it to be so
   - `no_evidence` — the claim is made but not supported in this section
3. Note the source location (figure number, table number, paragraph, equation)
4. Flag `evidence_strength`: `strong` / `moderate` / `weak` / `none`
   - `strong`: direct measurement or formal proof in this paper
   - `moderate`: suggestive data or well-reasoned argument with caveats
   - `weak`: assertion supported only by analogy, citation, or intuition
   - `none`: claim made without support

A single claim may have multiple pieces of evidence. A single piece of evidence may support multiple claims — note the overlap in both entries.

**Known failure modes to avoid:**
- Do not treat a restatement of the claim as evidence for it
- Do not treat the paper's confidence level as evidence strength (a confident claim with no data is still `none`)
- Do not import evidence from other sections — only what appears in the section you're analyzing

---

## OUTPUT FORMAT

```json
[
  {
    "claim_id": "C01",
    "evidence_text": "Short quote or close paraphrase of the supporting text",
    "evidence_type": "direct_data | logical_derivation | analogy | cited_prior_work | definition_by_fiat | no_evidence",
    "source_location": "Figure 2 / Table 1 / paragraph 3 / equation 4 / etc.",
    "evidence_strength": "strong | moderate | weak | none",
    "also_supports": ["C03", "C07"]
  }
]
```

If a claim has no evidence in this section, still include an entry with `evidence_type: "no_evidence"` and `evidence_strength: "none"`. Do not silently skip unsupported claims.

---

*Part of the [agentic-mindmap](https://github.com/EskilXu/agentic-mindmap) paper-reading workflow.*

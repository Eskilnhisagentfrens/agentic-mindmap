# Prompt: Claims Extraction

**Pass 1 of 4** — Extract the distinct, load-bearing claims from a paper section.

---

## INPUT

Paste the paper section text below the `---` divider. Include the section heading if available.

For best results, run this pass one section at a time (Introduction, Methods, Results, Discussion, Conclusion). Avoid pasting the full paper at once — claim boundaries blur across sections.

---

## INSTRUCTION

You are a careful reader performing claim extraction on an academic or research document. Your job is not to summarize — it is to identify the distinct, falsifiable, or verifiable assertions the author is making.

For each claim you find:

1. State it in one sentence, in your own words but faithful to the author's meaning. Do not merge two claims into one sentence. Do not split a single claim into two.
2. Identify which part of the section it comes from (e.g. paragraph 2, figure caption, footnote 3).
3. Classify the claim type:
   - `empirical` — backed by data, experiment, or measurement in this paper
   - `theoretical` — logical or mathematical argument without new data
   - `definitional` — establishes how a term is used in this paper
   - `referenced` — asserts something by citing another source (not demonstrated here)
   - `normative` — a "should" or "ought" claim, evaluative rather than descriptive
4. Flag if the claim is `load_bearing` (true/false) — meaning the paper's core argument fails or weakens significantly if this claim is wrong.

Output a JSON array. Do not include commentary outside the JSON block.

**Known failure modes to avoid:**
- Do not report the paper's framing of prior work as a claim by *this* paper
- Do not conflate a claim with its supporting evidence (they will be separated in Pass 2)
- Do not include claims that are pure background or motivation without assertive force
- Do not smooth over hedged language ("may suggest", "is consistent with") — preserve the hedge in the statement field

---

## OUTPUT FORMAT

```json
[
  {
    "id": "C01",
    "statement": "One-sentence faithful restatement of the claim",
    "paper_section": "Section heading or paragraph reference",
    "type": "empirical | theoretical | definitional | referenced | normative",
    "load_bearing": true
  },
  {
    "id": "C02",
    "statement": "...",
    "paper_section": "...",
    "type": "...",
    "load_bearing": false
  }
]
```

Aim for 5–15 claims per major section. If you find more than 20, you are probably splitting too finely — step back and merge claims that are sub-points of the same assertion.

---

*Part of the [agentic-mindmap](https://github.com/EskilXu/agentic-mindmap) paper-reading workflow.*

# Worked Example: Constitutional AI paper → Mindmap

**Paper**: Bai et al. (2022), *Constitutional AI: Harmlessness from AI Feedback*
**arXiv**: https://arxiv.org/abs/2212.08073
**Sections covered in this example**: Abstract + Section 1 (Introduction)

This example shows one run of the full four-pass workflow on the Constitutional AI paper. It is a real output, not a polished reconstruction — including one place where Claude was wrong and I caught it.

---

## Pass 1 output: Claims extraction (Abstract + Introduction)

```json
[
  {
    "id": "C01",
    "statement": "Current RLHF-trained models require extensive human feedback on harmful outputs to learn harmlessness, which is expensive and exposes labelers to harmful content.",
    "paper_section": "Abstract / Introduction paragraph 1",
    "type": "empirical",
    "load_bearing": true
  },
  {
    "id": "C02",
    "statement": "Constitutional AI replaces human feedback on harmfulness with AI-generated feedback derived from a fixed set of principles (the 'constitution').",
    "paper_section": "Abstract",
    "type": "definitional",
    "load_bearing": true
  },
  {
    "id": "C03",
    "statement": "A model trained with Constitutional AI can be made non-evasive — willing to engage with sensitive topics — while remaining harmless.",
    "paper_section": "Introduction paragraph 3",
    "type": "empirical",
    "load_bearing": true
  },
  {
    "id": "C04",
    "statement": "The constitutional principles used in this paper are derived from sources including the UN Declaration of Human Rights, and are intended to be transparent and human-interpretable.",
    "paper_section": "Introduction paragraph 4",
    "type": "definitional",
    "load_bearing": false
  },
  {
    "id": "C05",
    "statement": "Scaling supervision — using AI models to assist or replace human labelers — is necessary as AI systems become more capable than humans at specific tasks.",
    "paper_section": "Introduction paragraph 2",
    "type": "normative",
    "load_bearing": false
  }
]
```

---

## Pass 2 output: Evidence pass for C03

C03 is the most load-bearing claim that requires empirical support, so this is the most important evidence pass to run carefully.

```json
[
  {
    "claim_id": "C03",
    "evidence_text": "We show in Figure 1 that CAI-trained models score higher on harmlessness while maintaining helpfulness scores comparable to RLHF models trained without harmlessness constraints.",
    "evidence_type": "direct_data",
    "source_location": "Figure 1 caption + Introduction paragraph 3",
    "evidence_strength": "moderate",
    "also_supports": ["C02"]
  },
  {
    "claim_id": "C03",
    "evidence_text": "The paper cites human evaluation results showing CAI models were preferred over HH-RLHF on both harmlessness and non-evasiveness in head-to-head comparisons.",
    "evidence_type": "direct_data",
    "source_location": "Introduction paragraph 3",
    "evidence_strength": "moderate",
    "also_supports": []
  }
]
```

**Evidence strength is `moderate`, not `strong`**: Figure 1 is introduced in the introduction before the methodology is explained. At this stage of reading, we don't know enough about the evaluation design (who the human raters are, what "harmless" means operationally, how "non-evasive" is defined) to treat this as strong evidence. This is a flag to check when we reach the methods section.

---

## Where Claude was wrong — and I caught it

During Pass 1, Claude's first draft included this claim:

> *"The constitutional principles were empirically validated to produce better-aligned models than alternative principle sets."*

I flagged this because it wasn't what the paper says. The paper describes *using* a constitution and showing the results are good — it does not compare alternative constitutions or validate the specific principles against alternatives. This would be scope creep: treating a design choice as a validated finding.

When I pointed this out, Claude acknowledged it and removed the claim. The corrected Pass 1 output (above) doesn't include this false claim.

**Lesson**: Pass 1 is vulnerable to Claude "completing the argument" — adding claims the paper implies but doesn't make. Running evidence pass immediately after is partly a check on this: if you can't find evidence for a claim in the text, the claim may have been invented.

---

## Final mindmap structure (Markdown, wikilink format)

```markdown
# [[Constitutional AI (Bai et al. 2022)]]

## [[C01 - Problem: RLHF harmlessness is expensive]]
- Evidence: stated as motivation, not measured in this paper
- Confidence: 0.6 (referenced claim — prior work, not demonstrated here)
- Note: load-bearing motivation claim

## [[C02 - Core method: AI feedback from constitutional principles]]
- Evidence: definitional — paper defines this as the method
- Confidence: 1.0 (definitional claim, true by construction)
- Child: [[C04 - Constitution sources: UDHR + others]]

## [[C03 - Result: non-evasive AND harmless is achievable]]
- Evidence: Figure 1, human evaluation (moderate strength)
- Confidence: 0.65 (good evidence, methodology detail pending)
- ⚠️ Check: how is "non-evasive" operationalized in eval?
- Related: [[T01 - Tension: evaluation design not yet described]]

## [[C05 - Motivation: scalable supervision is necessary]]
- Evidence: normative claim, no direct evidence given
- Confidence: 0.5 (reasonable argument, not demonstrated)
- Note: not load-bearing; sets context only
```

---

## What to do next with this map

1. Paste the Markdown above into `agentic-mindmap` app
2. Use AI Expand on `[[C03]]` to decompose "what would strong evidence for this look like" — then compare against the Methods section when you read it
3. Run the four passes again on the Methods and Results sections
4. Use the MCP `mindmap_add_node` to add new claims as child nodes of the relevant parent when you find them

The map grows as you read. By the end of the paper, you have a structure you built in conversation with both the paper and the model — not a summary the model wrote for you.

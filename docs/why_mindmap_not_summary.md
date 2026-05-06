# Why Mindmap, Not Summary

*A note on the fluency-is-not-truth problem and why the shape of the output matters.*

---

The most seductive thing about asking an LLM to summarize a paper is how good the summary sounds. The model produces fluent prose, organized paragraphs, confident transitions. It reads like someone who understood the paper and is now explaining it to you. The problem is that fluency is not truth — it's a property of the text, not a property of the relationship between the text and the paper.

I learned this the hard way. In 2025, while exploring Anthropic's published alignment research, I asked Claude to summarize a 60-page technical paper. The summary was excellent by every surface metric: well-organized, hits the main themes, clear language. Then I read the paper. About 30% of what the summary attributed to the paper as findings were actually the paper's framings of *other people's work*. Another 15% were reasonable inferences the model made — things the paper implied but never stated. The rest was accurate.

That 45% error rate is not a prompting problem. It's a structural problem: a linear summary cannot easily distinguish "the paper claims X" from "the paper mentions that others have claimed X" from "X follows naturally from the paper's argument even though the paper never says it." All three look the same in fluent prose.

## Why structure matters

A mindmap forces a different discipline. To place a claim as a node, you have to decide: is this a top-level claim (load-bearing) or a supporting claim (dependent)? If it's dependent, what does it depend on — and is that dependency shown in the paper, or assumed? A summary lets you smuggle in assumptions. A mindmap makes them visible as structural choices.

This is exactly what the four-pass workflow is designed to produce: not a better summary, but a structured artifact where each claim has an explicit evidence status and confidence score. When you import that into the mindmap app, the topology tells you something a summary cannot — where the argument is well-supported and where it's bridged by inference or assumption.

## A concrete example

In the Constitutional AI paper (Bai et al. 2022), a naive summary would say something like: "The paper demonstrates that Constitutional AI produces models that are both harmless and non-evasive, validated through human evaluation."

That summary is approximately true, but it flattens three things that matter:

1. "Harmless" is operationalized through a specific evaluation design that has its own assumptions — which the summary doesn't flag
2. "Non-evasive" is a claimed property the paper asserts, but the operationalization of "evasive" is subtle and contestable
3. "Validated through human evaluation" — the paper uses human raters, but the rater pool, agreement rates, and calibration methodology are in the Methods section, not the Introduction where the claim is first made

In the mindmap version of this reading, all three of these appear as explicit flags on the relevant nodes. The map looks more uncertain than the summary. That uncertainty is not a bug — it's the honest state of the evidence at the point where you've read the Introduction but not yet the Methods.

## The map does not replace the paper

This is the failure mode to avoid at the meta-level: using the map as a substitute for reading the paper, which recreates the original problem one level up. The map is a navigation tool. It tells you where to read carefully, where the load-bearing claims are, where the evidence is weakest. The paper is still the thing you read.

The workflow is slow on purpose. Running four passes on even a single section of a paper takes 30–60 minutes. That's not a flaw — it's a feature. The cognitive cost of building the map is the cost of actually reading the paper. If you want to spend less time, use a summary. If you want to actually know what the paper says, build the map.

---

*Part of the [agentic-mindmap](https://github.com/EskilXu/agentic-mindmap) documentation.*

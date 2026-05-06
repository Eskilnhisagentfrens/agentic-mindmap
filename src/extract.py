"""
extract.py — PDF to section chunks for the agentic-mindmap workflow.

Usage:
    python src/extract.py paper.pdf
    python src/extract.py paper.pdf --section "Introduction"

Output: prints section chunks to stdout, one section per block,
separated by --- delimiters. Paste each block into the claims_extraction
prompt in prompts/claims_extraction.md.

Requires: pypdf (pip install pypdf)
The agentic logic lives in prompts/ — this script handles only the
mechanical extraction of text from PDF.
"""

import argparse
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Error: pypdf not installed. Run: pip install pypdf", file=sys.stderr)
    sys.exit(1)


# Section heading patterns common in academic papers.
# Extend this list for domain-specific formats.
SECTION_MARKERS: list[str] = [
    "abstract",
    "introduction",
    "background",
    "related work",
    "methodology",
    "methods",
    "approach",
    "experiments",
    "results",
    "evaluation",
    "discussion",
    "conclusion",
    "limitations",
    "acknowledgements",
    "references",
]


def extract_pages(pdf_path: Path) -> list[str]:
    """Return raw text for each page as a list."""
    reader = PdfReader(str(pdf_path))
    return [page.extract_text() or "" for page in reader.pages]


def chunk_by_section(pages: list[str]) -> dict[str, str]:
    """
    Best-effort section detection by scanning for heading-like lines.
    Returns an ordered dict of {section_name: text}.
    Imperfect — two-column PDFs and scanned PDFs will produce garbled output.
    """
    full_text = "\n".join(pages)
    lines = full_text.splitlines()

    sections: dict[str, list[str]] = {"preamble": []}
    current_section = "preamble"

    for line in lines:
        stripped = line.strip().lower()
        matched = next(
            (m for m in SECTION_MARKERS if stripped.startswith(m) and len(stripped) < 60),
            None,
        )
        if matched:
            current_section = line.strip()
            sections[current_section] = []
        else:
            sections.setdefault(current_section, []).append(line)

    return {k: "\n".join(v).strip() for k, v in sections.items() if v}


def print_chunks(sections: dict[str, str], filter_section: str | None = None) -> None:
    """Print sections to stdout, separated by --- delimiters."""
    for name, text in sections.items():
        if filter_section and filter_section.lower() not in name.lower():
            continue
        if not text:
            continue
        print(f"=== {name} ===")
        print(text)
        print("---")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract PDF sections for mindmap workflow")
    parser.add_argument("pdf", type=Path, help="Path to PDF file")
    parser.add_argument("--section", type=str, default=None, help="Filter to a specific section name")
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"Error: file not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    pages = extract_pages(args.pdf)
    sections = chunk_by_section(pages)
    print_chunks(sections, filter_section=args.section)


if __name__ == "__main__":
    main()

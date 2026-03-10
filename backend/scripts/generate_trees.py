#!/usr/bin/env python3
"""Batch-generate hierarchical document trees for all category PDFs using Ollama.

Extracts text via PyMuPDF, groups pages into sections, and uses Ollama to
generate titles + summaries for each section.  Fully local — no cloud APIs.

Usage:
    cd backend
    python scripts/generate_trees.py                       # all categories
    python scripts/generate_trees.py --category 3          # only Category 3
    python scripts/generate_trees.py --category 5 --force  # regenerate cat 5
    python scripts/generate_trees.py --pages-per-section 8 # larger sections

Prerequisites:
    - Ollama running at http://localhost:11434
    - Model pulled:  ollama pull gemma3:4b  (or gemma3:12b for higher quality)
    - pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import fitz  # PyMuPDF
import httpx

# Ensure backend/ is on sys.path so config.py imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    CATEGORY_FOLDERS,
    CORPUS_DIR,
    TREES_DIR,
    TREE_GENERATION_MODEL,
    OLLAMA_GENERATE_URL,
)

# ── Ollama LLM helper ───────────────────────────────────

def call_ollama_sync(prompt: str, model: str, timeout: float = 120.0) -> str:
    """Blocking call to Ollama /api/generate."""
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            OLLAMA_GENERATE_URL,
            json={"model": model, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json().get("response", "")


# ── PDF text extraction ──────────────────────────────────

def extract_pages(pdf_path: Path) -> list[str]:
    """Return a list of per-page text strings from a PDF."""
    doc = fitz.open(str(pdf_path))
    pages = [page.get_text("text") for page in doc]
    doc.close()
    return pages


# ── Section grouping ─────────────────────────────────────

def group_pages_into_sections(
    pages: list[str], pages_per_section: int = 5
) -> list[dict]:
    """Group consecutive pages into sections.

    Returns a list of dicts with start_page, end_page, and combined text.
    """
    sections: list[dict] = []
    for i in range(0, len(pages), pages_per_section):
        chunk = pages[i : i + pages_per_section]
        text = "\n\n".join(chunk).strip()
        if not text:
            continue
        sections.append({
            "start_page": i + 1,               # 1-indexed
            "end_page": min(i + pages_per_section, len(pages)),
            "text": text,
        })
    return sections


# ── LLM summarisation ───────────────────────────────────

_SUMMARY_PROMPT = """\
You are a document analyst. Given a section of a document, provide:
1. A short **title** (max 10 words) describing the section's topic
2. A **summary** (2-3 sentences) of the key content

Section text (pages {start_page}-{end_page}):
---
{text_snippet}
---

Respond ONLY with valid JSON, no other text:
{{"title": "...", "summary": "..."}}"""


def summarise_section(
    section: dict, model: str, max_chars: int = 3000
) -> dict:
    """Use Ollama to generate a title + summary for a section."""
    snippet = section["text"][:max_chars]
    prompt = _SUMMARY_PROMPT.format(
        start_page=section["start_page"],
        end_page=section["end_page"],
        text_snippet=snippet,
    )
    raw = call_ollama_sync(prompt, model)

    # Parse LLM JSON
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        return {
            "title": parsed.get("title", f"Pages {section['start_page']}-{section['end_page']}"),
            "summary": parsed.get("summary", ""),
        }
    except json.JSONDecodeError:
        return {
            "title": f"Pages {section['start_page']}-{section['end_page']}",
            "summary": cleaned[:200] if cleaned else "",
        }


# ── Tree builder ─────────────────────────────────────────

def build_tree(
    pdf_path: Path,
    pages_per_section: int,
    model: str,
) -> dict:
    """Build a hierarchical tree for a PDF.

    Structure:
      root (whole document) → section nodes (groups of N pages)
    """
    pages = extract_pages(pdf_path)
    if not pages:
        raise ValueError(f"No text extracted from {pdf_path.name}")

    sections = group_pages_into_sections(pages, pages_per_section)
    all_text = "\n\n".join(p for p in pages if p.strip())

    # Root node — summarise from first ~3000 chars
    print(f"    Summarising root ({len(pages)} pages) ...", end=" ", flush=True)
    root_summary = summarise_section(
        {"text": all_text, "start_page": 1, "end_page": len(pages)},
        model,
    )
    print("done")

    child_nodes: list[dict] = []
    for idx, sec in enumerate(sections):
        node_id = f"{idx + 1:04d}"
        print(
            f"    Section {idx + 1}/{len(sections)} "
            f"(pp {sec['start_page']}-{sec['end_page']}) ...",
            end=" ",
            flush=True,
        )
        meta = summarise_section(sec, model)
        print("done")

        child_nodes.append({
            "node_id": node_id,
            "title": meta["title"],
            "summary": meta["summary"],
            "start_page": sec["start_page"],
            "end_page": sec["end_page"],
            "text": sec["text"],
            "nodes": [],
        })

    tree = {
        "node_id": "0000",
        "title": root_summary["title"],
        "summary": root_summary["summary"],
        "start_page": 1,
        "end_page": len(pages),
        "text": all_text[:500],  # keep root text short (LLM sees summary anyway)
        "nodes": child_nodes,
    }
    return tree


# ── File helpers ─────────────────────────────────────────

def find_pdfs(category: int) -> list[Path]:
    """Recursively find all PDFs in the category folder."""
    folder_name = CATEGORY_FOLDERS.get(category)
    if not folder_name:
        print(f"[SKIP] No folder mapping for category {category}")
        return []
    folder = CORPUS_DIR / folder_name
    if not folder.exists():
        print(f"[SKIP] Folder not found: {folder}")
        return []
    return sorted(folder.rglob("*.pdf"))


def tree_output_path(category: int, pdf_path: Path) -> Path:
    """Return the expected output path for a PDF's tree JSON."""
    out_dir = TREES_DIR / f"cat{category}"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{pdf_path.stem}_structure.json"


# ── Main ─────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate document trees locally via Ollama + PyMuPDF"
    )
    parser.add_argument(
        "--category",
        type=int,
        choices=[1, 2, 3, 4, 5],
        help="Only process this category (default: all with PDFs)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=TREE_GENERATION_MODEL,
        help=f"Ollama model for summarisation (default: {TREE_GENERATION_MODEL})",
    )
    parser.add_argument(
        "--pages-per-section",
        type=int,
        default=5,
        help="Pages per tree section node (default: 5)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-generate even if tree file already exists",
    )
    args = parser.parse_args()

    categories = [args.category] if args.category else list(CATEGORY_FOLDERS.keys())

    total = 0
    generated = 0
    skipped = 0
    failed = 0

    t0 = time.time()

    for cat in categories:
        pdfs = find_pdfs(cat)
        print(f"\n── Category {cat}: {len(pdfs)} PDFs found ──")

        for pdf in pdfs:
            total += 1
            out = tree_output_path(cat, pdf)

            if out.exists() and not args.force:
                print(f"  [SKIP] {pdf.name} (tree exists)")
                skipped += 1
                continue

            print(f"  [GEN]  {pdf.name} ({pdf.stat().st_size // 1024} KB)")
            try:
                tree = build_tree(pdf, args.pages_per_section, model=args.model)
                with open(out, "w", encoding="utf-8") as f:
                    json.dump(tree, f, indent=2, ensure_ascii=False)
                n_sections = len(tree["nodes"])
                print(f"  [OK]   → {out.name} ({n_sections} sections)")
                generated += 1
            except Exception as exc:
                print(f"  [FAIL] {pdf.name}: {exc}")
                failed += 1

    elapsed = time.time() - t0
    print(f"\n── Summary ({elapsed:.0f}s) ──")
    print(f"  Total PDFs : {total}")
    print(f"  Generated  : {generated}")
    print(f"  Skipped    : {skipped}")
    print(f"  Failed     : {failed}")


if __name__ == "__main__":
    main()

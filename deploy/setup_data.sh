#!/bin/bash
# ────────────────────────────────────────────────────────
# Copy vectorstores and trees into deploy/data/ for Docker build.
# Run from project root:  bash deploy/setup_data.sh
# ────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Project root: $PROJECT_ROOT"
echo "Deploy dir:   $SCRIPT_DIR"
echo ""

# ── Copy vectorstores ───────────────────────────────────
mkdir -p "$SCRIPT_DIR/data/vectorstores"

for cat in 1 2 3 4 5; do
    SRC="$PROJECT_ROOT/Knwlodge base/vectorstores/chroma_cat${cat}"
    DST="$SCRIPT_DIR/data/vectorstores/chroma_cat${cat}"

    if [ -d "$SRC" ]; then
        echo "Copying chroma_cat${cat}..."
        rm -rf "$DST"
        cp -r "$SRC" "$DST"
    else
        echo "WARNING: $SRC not found — skipping"
    fi
done

echo ""

# ── Copy trees (optional, for PageIndex Stage 2) ────────
if [ -d "$PROJECT_ROOT/backend/trees" ]; then
    echo "Copying trees..."
    rm -rf "$SCRIPT_DIR/app/trees"
    cp -r "$PROJECT_ROOT/backend/trees" "$SCRIPT_DIR/app/trees"
else
    echo "No trees/ found in backend — skipping (PageIndex will be unavailable)"
fi

echo ""
echo "Done! Sizes:"
du -sh "$SCRIPT_DIR/data/vectorstores" 2>/dev/null || echo "  vectorstores: not found"
du -sh "$SCRIPT_DIR/app/trees" 2>/dev/null || echo "  trees: not found"
echo ""
echo "Next steps:"
echo "  1. cd deploy"
echo "  2. cp .env.example .env  (fill in your API keys)"
echo "  3. docker build -t bcn-api ."
echo "  4. docker run -p 8001:8001 --env-file .env bcn-api"

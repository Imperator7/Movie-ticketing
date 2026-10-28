#!/usr/bin/env bash
# Code knowledge graph (graphify), always offline: code is parsed locally with tree-sitter, no LLM, no API key,
# no query log. Used by the `codebase-graph` skill.
#
#   npm run graph:build                         build/refresh graphify-out/ (~10 s)
#   npm run graph -- query "how are seats locked"
#   npm run graph -- explain "CatalogService"
#   npm run graph -- path "AuthController" "PrismaService"
set -euo pipefail

export GRAPHIFY_BACKEND=none GRAPHIFY_QUERY_LOG_DISABLE=1
cd "$(dirname "$0")/.."

bin="$(command -v graphify || true)"
[[ -z "$bin" && -x "$HOME/.local/share/graphify/venv/bin/graphify" ]] && bin="$HOME/.local/share/graphify/venv/bin/graphify"
if [[ -z "$bin" ]]; then
  cat >&2 <<'EOF'
graphify is not installed. Install it once (official PyPI package is "graphifyy", two y's):
  python3 -m venv ~/.local/share/graphify/venv
  ~/.local/share/graphify/venv/bin/pip install "graphifyy[sql]"
EOF
  exit 127
fi

if [[ "${1:-}" == "build" ]]; then
  "$bin" extract . --code-only
  exec "$bin" cluster-only .
fi

if [[ ! -f graphify-out/graph.json ]]; then
  echo "No graph yet: run npm run graph:build first (~10 s)." >&2
  exit 1
fi
exec "$bin" "$@"

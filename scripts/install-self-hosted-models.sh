#!/usr/bin/env sh
set -eu

command -v ollama >/dev/null 2>&1 || {
  echo "Ollama is required. Install it from https://ollama.com/download" >&2
  exit 1
}

echo "Pulling Lunavo's recommended local intelligence pack..."
ollama pull qwen3:4b
ollama pull qwen3:14b
ollama pull deepseek-r1:14b
ollama pull qwen3-coder:30b
ollama pull gemma3:12b
ollama pull nomic-embed-text

echo
echo "Local model pack ready."
echo "Configure Lunavo with:"
echo "  LUNAVO_LOCAL_LLM_URL=http://127.0.0.1:11434/v1/chat/completions"
echo "  LUNAVO_LOCAL_LLM_MODEL=qwen3:14b"
echo "and keep the role-specific model names from .env.example."

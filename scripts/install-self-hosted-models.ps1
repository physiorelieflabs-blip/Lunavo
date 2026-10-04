$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw "Ollama is required. Install it from https://ollama.com/download"
}

Write-Host "Pulling Lunavo's recommended local intelligence pack..."
ollama pull qwen3:4b
ollama pull qwen3:14b
ollama pull deepseek-r1:14b
ollama pull qwen3-coder:30b
ollama pull gemma3:12b
ollama pull nomic-embed-text

Write-Host ""
Write-Host "Local model pack ready."
Write-Host "Set LUNAVO_LOCAL_LLM_URL to http://127.0.0.1:11434/v1/chat/completions"
Write-Host "and keep the role-specific model names from .env.example."

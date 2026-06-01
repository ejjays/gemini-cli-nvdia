# NVIDIA API Integration for Gemini CLI

## ✅ Successfully Modified!

This Gemini CLI fork now supports NVIDIA API (OpenAI-compatible endpoint) for accessing models like DeepSeek v4.

## Setup

1. **Get your NVIDIA API key** from https://build.nvidia.com/

2. **Set the environment variable:**
```bash
export NVIDIA_API_KEY="nvapi-your-key-here"
```

3. **Run the CLI:**
```bash
bash dev.sh --skip-trust --model "deepseek-ai/deepseek-v4-pro" -p "Your prompt here"
```

## Available Models

Check available models:
```bash
curl -H "Authorization: Bearer $NVIDIA_API_KEY" https://integrate.api.nvidia.com/v1/models
```

### Popular Models:
- `deepseek-ai/deepseek-v4-pro` - DeepSeek v4 Pro (best quality)
- `deepseek-ai/deepseek-v4-flash` - DeepSeek v4 Flash (faster)
- `meta/llama-3.3-70b-instruct` - Llama 3.3 70B
- `nvidia/llama-3.1-nemotron-70b-instruct` - NVIDIA Nemotron
- `mistralai/mistral-large` - Mistral Large
- `qwen/qwen3.5-122b-a10b` - Qwen 3.5

## Usage Examples

### Headless mode (one-shot):
```bash
export NVIDIA_API_KEY="your-key"
bash dev.sh --skip-trust --model "deepseek-ai/deepseek-v4-pro" -p "Explain quantum computing"
```

### Interactive mode:
```bash
export NVIDIA_API_KEY="your-key"
bash dev.sh --skip-trust --model "deepseek-ai/deepseek-v4-flash"
```

### With file context:
```bash
export NVIDIA_API_KEY="your-key"
bash dev.sh --skip-trust --model "deepseek-ai/deepseek-v4-pro" -p "Review this code: $(cat myfile.py)"
```

## Technical Details

### What was modified:
1. Added `NVIDIA_API` auth type to `AuthType` enum
2. Updated `getAuthTypeFromEnv()` to detect `NVIDIA_API_KEY`
3. Created `OpenAIAdapter` class to translate Google GenAI format → OpenAI format
4. Added NVIDIA handling in `createContentGeneratorConfig()` and `createContentGenerator()`
5. Updated auth validation in `packages/cli/src/config/auth.ts`

### Files modified:
- `packages/core/src/core/contentGenerator.ts`
- `packages/core/src/core/openaiAdapter.ts` (new file)
- `packages/cli/src/config/auth.ts`
- `dev.sh` (build script)

## Notes

- The `--skip-trust` flag is needed for headless mode
- Streaming responses work correctly
- Model names must match NVIDIA's format (e.g., `deepseek-ai/deepseek-v4-pro`)
- The adapter translates between Google's and OpenAI's API formats automatically

## Troubleshooting

**"Invalid auth method selected"**
- Make sure `NVIDIA_API_KEY` is set: `echo $NVIDIA_API_KEY`

**404 error**
- Check the model name is correct
- Verify your API key is valid

**Build errors**
- Run `bash dev.sh --build-only` to rebuild
- Check that `openai` npm package is installed in `packages/core`

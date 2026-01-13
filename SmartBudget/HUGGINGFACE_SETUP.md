# Hugging Face API Setup for News Filtering

## Get Your Free API Token

1. Go to https://huggingface.co/join
2. Create a free account (or sign in)
3. Go to https://huggingface.co/settings/tokens
4. Click "New token"
5. Name it "SmartBudget News" (or any name)
6. Select "Read" permission
7. Click "Generate token"
8. Copy the token (starts with `hf_...`)

## Add to Environment Variables

Add these to your `.env` file:

```
HF_NEWS_API_KEY=hf_your_token_here
HF_NEWS_MODEL=mistralai/Mistral-7B-Instruct-v0.2
```

Or use any other free text generation model from Hugging Face:
- `mistralai/Mistral-7B-Instruct-v0.2` (recommended)
- `meta-llama/Llama-2-7b-chat-hf`
- `google/flan-t5-large`

## Notes

- Free tier has rate limits (about 30 requests/minute)
- First request may take longer (model loading)
- Token is free and never expires unless you revoke it


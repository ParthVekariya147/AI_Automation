# Feature 09 — AI Caption System (Gemini)

## Purpose
- Generate Instagram captions and hashtags from media files using Google Gemini
- Support multiple API keys with automatic rotation on rate-limit
- Used by both manual caption generation (Studio) and automated folder processing
- Provide hashtag suggestions from caption text alone (no media required)

---

## API Endpoints (Indirect — called by other features)

### POST `/api/posts/:id/suggest-hashtags`
- **Auth:** JWT + active membership
- **Purpose:** Frontend calls this to get AI hashtag suggestions for a draft's caption
- **Body:** `{ businessId }`
- **Returns:** `{ hashtags: string[] }`
- **Internally calls:** `suggestHashtagsWithAI(draft.caption)` from `ai.service.ts`

> Caption generation for individual assets is also triggered during automation runs
> (`folder-automation.service.ts`) and from the Studio page via the media controller.

---

## Service: `ai.service.ts`

### Key Pool — `ApiKeyManager`
Collects every env var matching `GEMINI_API_KEY*` at startup:
- `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, etc.
- Values can be comma-separated within one var
- Deduplication enforced (a key appearing in multiple vars is loaded once)

**Rotation logic:**
- On `429 / 503 / RESOURCE_EXHAUSTED` → cool key for **60 seconds**, try next
- On `400 / API_KEY_INVALID` → cool key for **30 seconds**, try next
- Network/parse errors → throw immediately (no retry)
- All keys on cooldown → throw `"All Gemini API keys are rate-limited"`

### Public Functions

| Function | Purpose |
|---|---|
| `generateInstagramCaptionFromMedia(input)` | Single image or video → caption + hashtags |
| `generateCaptionForCarousel(input)` | Up to 8 images → unified carousel caption |
| `suggestHashtagsWithAI(caption)` | Caption text → 15–20 targeted hashtags |
| `suggestHashtagsFromCaption(caption)` | Keyword fallback (no AI) |
| `getGeminiKeyCount()` | Returns total key pool size (used by automation to size batches) |
| `getGeminiAvailableCount()` | Returns keys not currently on cooldown |

---

## External API Used

### Google Gemini API
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<KEY>`
- **Method:** POST
- **Content-Type:** `application/json`

#### Single Image/Video Request Body
```json
{
  "contents": [{
    "parts": [
      { "text": "<system prompt + caption rules + hashtag rules>" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } }
    ]
  }],
  "generationConfig": { "temperature": 0.8, "maxOutputTokens": 2048 }
}
```

#### Carousel Request Body
```json
{
  "contents": [{
    "parts": [
      { "text": "<carousel prompt>" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64 slide 1>" } },
      { "inline_data": { "mime_type": "image/jpeg", "data": "<base64 slide 2>" } }
    ]
  }],
  "generationConfig": { "temperature": 0.85, "maxOutputTokens": 1500 }
}
```

#### Hashtag-only Request Body
```json
{
  "contents": [{ "parts": [{ "text": "<hashtag prompt with caption>" }] }],
  "generationConfig": { "temperature": 0.4, "maxOutputTokens": 300 }
}
```

---

## Prompts

### Single Image Prompt Rules
- 3–5 lines: powerful hook → vivid story → emotional resonance → CTA
- 3–5 emojis placed naturally (not all at end)
- Personal, authentic tone — never corporate
- NEVER mention filename or describe it as "a photo/image"
- 20 unique hashtags: 5 ultra-niche (<100k), 8 content-specific (100k–1M), 5 trending (1M–10M), 2 broad (10M+)

### Carousel Prompt Rules
- 4–6 lines: swipe hook → slide-by-slide arc → emotional peak → "save & share" CTA
- First line must create urgency to make user swipe
- 25 unique hashtags spanning all slides
- Brand voice injected via `brandVoice` parameter

### Hashtag Prompt Rules
- Analyses caption text only
- 15–20 hashtags
- No `#` prefix in array values (added by service after parsing)

---

## Response Parsing — Three-Pass Strategy

Gemini does not always return clean JSON. The `extractCaptionResult()` function tries:

1. **Pass 1:** Strip markdown code fences (` ```json `) → JSON.parse
2. **Pass 2:** Find first `{` to last `}` in raw text → JSON.parse
3. **Pass 3:** Regex extract `"caption": "..."` + `"hashtags": [...]` from malformed/truncated JSON

If all passes fail, throws with the raw Gemini response for debugging.

**Thinking model handling:** `gemini-2.5-flash` returns parts with `thought: true` before the actual response. The extractor skips thought parts automatically.

---

## Carousel Fallback
If carousel caption JSON parse fails entirely, the service falls back to calling `generateInstagramCaptionFromMedia` on just the **first image** of the carousel.

---

## Environment Variables
- `GEMINI_API_KEY` — primary key (required if AI is used)
- `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, … — additional keys (any var starting with `GEMINI_API_KEY`)
- `GEMINI_API_KEYS` — comma-separated list (also supported)

---

## Key Rules
- Carousel: max **8 images** sent to Gemini per call (files >10MB are skipped)
- All hashtags returned by Gemini without `#` get the prefix added by the service
- `suggestHashtagsFromCaption()` (no AI) is the fallback when Gemini is unavailable — extracts keywords from caption text
- Key rotation is **transparent** to callers — `callGemini()` handles all retry logic internally
- `getGeminiKeyCount()` lets the automation service size parallel batches to the key pool size

---

## Dependencies
- **Content Queue** (Feature 06) — `suggest-hashtags` endpoint
- **Media Library** (Feature 05) — reads media files from disk for base64 encoding
- **Folder Automations** (Feature 07) — calls `generateInstagramCaptionFromMedia` and `generateCaptionForCarousel` for each automation group

import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

// ── API Key Manager ──────────────────────────────────────────────────────────

function loadGeminiKeys(): string[] {
  // Collect from ALL env vars starting with GEMINI_API_KEY (handles GEMINI_API_KEY,
  // GEMINI_API_KEY1, GEMINI_API_KEYS, GEMINI_API_KEYS2, GEMINI_API_KEYS3, etc.)
  const seen = new Set<string>();
  const keys: string[] = [];
  Object.keys(process.env)
    .filter((k) => k.startsWith("GEMINI_API_KEY"))
    .sort()
    .forEach((k) => {
      for (const val of (process.env[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!seen.has(val)) { seen.add(val); keys.push(val); }
      }
    });
  return keys;
}

type KeyEntry = { key: string; cooldownUntil: number };

class ApiKeyManager {
  private keys: KeyEntry[];
  public currentIndex = 0;

  constructor(keys: string[]) {
    this.keys = keys.map((key) => ({ key, cooldownUntil: 0 }));
    console.log(`[AI Service] Loaded ${this.keys.length} Gemini API key(s).`);
  }

  /** Returns the key at currentIndex if not on cooldown, else "". */
  current(): string {
    const entry = this.keys[this.currentIndex];
    if (!entry || entry.cooldownUntil > Date.now()) return "";
    return entry.key;
  }

  /** Find next available (non-cooled) key; updates currentIndex. Returns null if all cooled. */
  acquireAny(): string | null {
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      if (this.keys[idx].cooldownUntil <= now) {
        this.currentIndex = idx;
        return this.keys[idx].key;
      }
    }
    return null;
  }

  rotate() {
    if (this.keys.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      console.log(`[AI Service] Rotated to key index ${this.currentIndex}.`);
    }
  }

  /** Mark currentIndex key as rate-limited; also rotates to next. */
  markCurrentRateLimited(cooldownMs = 60_000) {
    const entry = this.keys[this.currentIndex];
    if (entry) {
      entry.cooldownUntil = Date.now() + cooldownMs;
      console.log(`[AI Service] Key ${this.currentIndex} rate-limited for ${cooldownMs}ms.`);
    }
    this.rotate();
  }

  /** Returns how many keys are currently off cooldown (available right now). */
  availableNow(): number {
    const now = Date.now();
    return this.keys.filter((k) => k.cooldownUntil <= now).length;
  }

  get count() {
    return this.keys.length;
  }
}

const keyManager = new ApiKeyManager(loadGeminiKeys());

/** Exported so automation service can size batches to key pool. */
export function getGeminiKeyCount(): number {
  return keyManager.count;
}

/** Returns how many keys are currently available (not on cooldown). */
export function getGeminiAvailableCount(): number {
  return keyManager.availableNow();
}

// ── Gemini fetch with automatic key rotation ─────────────────────────────────

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
};

async function callGemini(fetchFn: (apiKey: string) => Promise<any>): Promise<any> {
  const maxAttempts = Math.max(keyManager.count, 1);

  for (let i = 0; i < maxAttempts; i++) {
    const key = keyManager.acquireAny();
    if (!key) break; // all remaining keys are on cooldown

    try {
      return await fetchFn(key);
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.status === 503 ||
        String(err?.message).includes("quota") ||
        String(err?.message).includes("overloaded") ||
        String(err?.message).includes("RESOURCE_EXHAUSTED");
      const isInvalidKey =
        err?.status === 400 ||
        String(err?.message).includes("API_KEY_INVALID");

      if (isRateLimit || isInvalidKey) {
        const cooldownMs = isRateLimit ? 60_000 : 30_000;
        console.warn(`[AI Service] Key ${keyManager.currentIndex} failed (${err?.status ?? err?.message}). Cooling down ${cooldownMs}ms — trying next key…`);
        keyManager.markCurrentRateLimited(cooldownMs);
        // loop continues to next available key — no sleep
      } else {
        throw err; // non-quota error (network, parse, etc.) — fail immediately
      }
    }
  }

  throw new Error("All Gemini API keys are rate-limited. Try again later.");
}

function geminiEndpoint(apiKey: string, model = "gemini-2.5-flash"): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function extractText(payload: GeminiResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  // Thinking models (gemini-2.5-*) prefix response parts with thought:true — skip those.
  const responsePart = parts.find((p) => p.text && !p.thought) ?? parts.find((p) => p.text);
  return responsePart?.text?.trim() ?? "";
}

/**
 * Robustly extract { caption, hashtags } from any Gemini response —
 * handles markdown fences, leading prose, trailing notes, and partial JSON.
 */
function extractCaptionResult(raw: string): { caption: string; hashtags: string[] } | null {
  // ── Pass 1: strip code fences then parse the JSON object ──────────────────
  try {
    let text = raw
      .replace(/^[\s\S]*?```(?:json)?\s*/i, "") // drop everything up to ```json
      .replace(/```[\s\S]*$/i, "")              // drop closing ``` and trailing content
      .trim();

    // Narrow to first { … last } in case there is still surrounding prose
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e > s) text = text.slice(s, e + 1);

    const parsed = JSON.parse(text);
    if (typeof parsed?.caption === "string" && parsed.caption.trim()) {
      return {
        caption: parsed.caption.trim(),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : []
      };
    }
  } catch { /* try next strategy */ }

  // ── Pass 2: no code fence — find first { … last } ─────────────────────────
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s !== -1 && e > s) {
      const parsed = JSON.parse(raw.slice(s, e + 1));
      if (typeof parsed?.caption === "string" && parsed.caption.trim()) {
        return {
          caption: parsed.caption.trim(),
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : []
        };
      }
    }
  } catch { /* try next strategy */ }

  // ── Pass 3: regex extraction from malformed / truncated JSON ──────────────
  // Try complete string first, then fall back to truncated (MAX_TOKENS case)
  const captionMatch =
    raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/) ??
    raw.match(/"caption"\s*:\s*"((?:[^"\\]|\\.){20,})/); // truncated — grab what we have

  if (captionMatch?.[1]) {
    const caption = captionMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .trim();

    const hashtags: string[] = [];
    const tagsBlock = raw.match(/"hashtags"\s*:\s*\[([\s\S]*?)\]/);
    if (tagsBlock) {
      for (const m of tagsBlock[1].matchAll(/"([^"]+)"/g)) hashtags.push(m[1]);
    }
    return { caption, hashtags };
  }

  return null; // could not extract anything useful
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_ROLE = `You are an elite Instagram content strategist and copywriter.
You craft viral, human-sounding captions that drive real engagement.
You NEVER mention file names, technical metadata, or describe images as "images".
You write as if you personally experienced what is shown.`;

function singleImagePrompt(tone: string): string {
  return `${SYSTEM_ROLE}

Carefully study this image and create a complete Instagram post.

CAPTION RULES:
• 3–5 lines total: powerful hook → vivid story/insight → emotional resonance → clear CTA
• Use 3–5 emojis placed naturally in the text (not all at the end)
• Sound personal, authentic, and platform-native — not corporate or generic
• NEVER mention the file name, image dimensions, or describe it as "a photo/image"
• If a recognisable place or context is visible, weave it in naturally
• Tone: ${tone}

HASHTAG RULES:
• Generate exactly 20 unique, targeted hashtags
• Split: 5 ultra-niche (under 100k), 8 content-specific (100k–1M), 5 trending (1M–10M), 2 broad (10M+)
• Base every hashtag on what you ACTUALLY SEE in the image — no generic fillers
• No # prefix in the array values

OUTPUT: Return ONLY valid JSON — no markdown, no explanation:
{
  "caption": "<full caption with emojis>",
  "hashtags": ["tag1", "tag2", ...]
}`;
}

function carouselPrompt(count: number, brandVoice: string): string {
  return `${SYSTEM_ROLE}

You are analysing ${count} images that form ONE Instagram carousel post.
Build a SINGLE cohesive narrative that flows naturally across all slides.

CAPTION RULES:
• 4–6 lines: compelling swipe hook → slide-by-slide story arc → emotional peak → CTA that says "save & share"
• Use 4–6 emojis woven naturally throughout the caption
• First line must create urgency or curiosity to make the user swipe
• NEVER mention filenames, image numbers, or use "this image/photo"
• Brand voice: ${brandVoice || "authentic and engaging"}

HASHTAG RULES:
• Generate exactly 25 unique hashtags spanning the full carousel theme
• Base them on the VISUAL CONTENT you see across ALL images
• Split: 6 ultra-niche, 10 content-specific, 6 trending, 3 broad
• No # prefix in the array values

OUTPUT: Return ONLY valid JSON — no markdown, no explanation:
{
  "caption": "<full caption with emojis>",
  "hashtags": ["tag1", "tag2", ...]
}`;
}

function hashtagPrompt(caption: string): string {
  return `You are an Instagram hashtag specialist.
Analyse this caption and generate 15–20 highly relevant, targeted hashtags.

Caption:
"${caption}"

RULES:
• Mix ultra-niche, content-specific, trending, and broad tags
• No # prefix — return tag text only
• No generic filler tags like "like4like" or "follow"
• Return ONLY a JSON array of strings, e.g. ["tag1","tag2"]`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateInstagramCaptionInput {
  mimeType: string;
  mediaBase64: string;
  mediaType: "image" | "video";
  originalName: string;
  tone?: string;
}

export interface GenerateInstagramCaptionOutput {
  caption: string;
  hashtags: string[];
}

export async function generateInstagramCaptionFromMedia(
  input: GenerateInstagramCaptionInput
): Promise<GenerateInstagramCaptionOutput> {
  if (keyManager.count === 0) {
    throw new Error("No Gemini API keys configured in environment.");
  }

  const tone = input.tone?.trim() || "engaging, warm, and professional";

  return callGemini(async (apiKey) => {
    const res = await fetch(geminiEndpoint(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: singleImagePrompt(tone) },
              { inline_data: { mime_type: input.mimeType, data: input.mediaBase64 } }
            ]
          }
        ],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 }
      })
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Gemini ${res.status}: ${body}`);
      (err as any).status = res.status;
      throw err;
    }

    const payload = (await res.json()) as GeminiResponse;
    const raw = extractText(payload);
    const finishReason = payload.candidates?.[0]?.finishReason;
    console.log(`[AI Service] Gemini raw (first 300 chars): ${raw.slice(0, 300)}`);
    console.log(`[AI Service] finishReason: ${finishReason}, parts count: ${payload.candidates?.[0]?.content?.parts?.length ?? 0}`);

    const result = extractCaptionResult(raw);

    if (result?.caption) {
      return {
        caption: result.caption,
        hashtags: result.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`))
      };
    }

    throw new Error(
      `Could not parse caption from Gemini response. finishReason=${finishReason ?? "unknown"} raw=${raw.slice(0, 200)}`
    );
  });
}

export async function generateCaptionForCarousel(input: {
  mediaPaths: string[];
  mimeTypes: string[];
  brandVoice?: string;
}): Promise<GenerateInstagramCaptionOutput> {
  if (keyManager.count === 0) {
    throw new Error("No Gemini API keys configured in environment.");
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  const MAX_IMAGES = 8;

  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];

  for (let i = 0; i < Math.min(input.mediaPaths.length, MAX_IMAGES); i++) {
    try {
      const p = input.mediaPaths[i];
      if (!p) continue;
      const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      const buf = await readFile(abs);
      if (buf.byteLength > MAX_SIZE) continue;
      imageParts.push({
        inline_data: { mime_type: input.mimeTypes[i] ?? "image/jpeg", data: buf.toString("base64") }
      });
    } catch {
      // skip unreadable files
    }
  }

  if (!imageParts.length) {
    throw new Error("No readable media files found for carousel caption generation.");
  }

  const prompt = carouselPrompt(imageParts.length, input.brandVoice ?? "");

  return callGemini(async (apiKey) => {
    const res = await fetch(geminiEndpoint(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 1500 }
      })
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Gemini ${res.status}: ${body}`);
      (err as any).status = res.status;
      throw err;
    }

    const payload = (await res.json()) as GeminiResponse;
    const raw = extractText(payload);
    const result = extractCaptionResult(raw);

    if (result?.caption) {
      return {
        caption: result.caption,
        hashtags: result.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`))
      };
    }

    // Carousel parse failed — retry with single-image on first slide
    const first = imageParts[0];
    return generateInstagramCaptionFromMedia({
      mimeType: first.inline_data.mime_type,
      mediaBase64: first.inline_data.data,
      mediaType: "image",
      originalName: "carousel"
    });
  });
}

export async function suggestHashtagsWithAI(caption: string): Promise<string[]> {
  if (keyManager.count === 0 || !caption.trim()) {
    return suggestHashtagsFromCaption(caption);
  }

  try {
    return await callGemini(async (apiKey) => {
      const res = await fetch(geminiEndpoint(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: hashtagPrompt(caption) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
        })
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`Gemini ${res.status}: ${body}`);
        (err as any).status = res.status;
        throw err;
      }

      const payload = (await res.json()) as GeminiResponse;
      const raw = extractText(payload);

      // Try JSON array first
      try {
        const s = raw.indexOf("[");
        const e = raw.lastIndexOf("]");
        if (s !== -1 && e > s) {
          const arr = JSON.parse(raw.slice(s, e + 1)) as string[];
          if (Array.isArray(arr) && arr.length >= 3) {
            return arr.slice(0, 20).map((h) => (h.startsWith("#") ? h : `#${h}`));
          }
        }
      } catch { /* continue */ }

      // Regex fallback — extract any word-like tokens that look like hashtags
      const extracted = raw.match(/#?[a-zA-Z0-9_]{3,}/g) ?? [];
      if (extracted.length >= 3) {
        return extracted.slice(0, 20).map((h) => (h.startsWith("#") ? h : `#${h}`));
      }

      return suggestHashtagsFromCaption(caption);
    });
  } catch {
    return suggestHashtagsFromCaption(caption);
  }
}

// Simple keyword-based fallback (used when AI is unavailable)
export function suggestHashtagsFromCaption(caption: string): string[] {
  const tokens = caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);

  return Array.from(new Set(tokens)).slice(0, 10).map((t) => `#${t}`);
}

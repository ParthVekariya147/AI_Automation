import { env } from "../config/env.js";

export function suggestHashtagsFromCaption(caption: string) {
  const tokens = caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);

  const unique = Array.from(new Set(tokens)).slice(0, 8);

  return unique.map((token) => `#${token}`);
}

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

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function extractGeminiText(response: GeminiGenerateResponse) {
  const text = response.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text?.trim();
  return text || "";
}

function buildPrompt(input: GenerateInstagramCaptionInput) {
  const requestedTone = input.tone?.trim() || "engaging and professional";

  return [
    "Create a ready-to-post Instagram caption from the uploaded media.",
    `Media type: ${input.mediaType}`,
    `Original file name: ${input.originalName}`,
    `Tone: ${requestedTone}`,
    "Requirements:",
    "1. Write in natural human language.",
    "2. If a place/landmark is visible, mention the likely location naturally.",
    "3. Keep the caption concise (2-4 short lines).",
    "4. End with a subtle call-to-action.",
    "Return only the caption text."
  ].join("\n");
}

export async function generateInstagramCaptionFromMedia(
  input: GenerateInstagramCaptionInput
): Promise<GenerateInstagramCaptionOutput> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing in API environment variables");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    env.GEMINI_API_KEY
  )}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildPrompt(input) },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: input.mediaBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const caption = extractGeminiText(payload);

  if (!caption) {
    throw new Error("Gemini did not return a caption");
  }

  return {
    caption,
    hashtags: suggestHashtagsFromCaption(caption)
  };
}

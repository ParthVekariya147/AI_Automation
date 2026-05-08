import { type KeyboardEvent, useState } from "react";

interface HashtagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  onSuggest?: () => Promise<string[]> | void;
  suggesting?: boolean;
  maxTags?: number;
}

export function HashtagInput({
  tags,
  onChange,
  onSuggest,
  suggesting,
  maxTags = 30,
}: HashtagInputProps) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const cleaned = raw.trim().replace(/^#+/, "");
    if (!cleaned) return;
    const tag = `#${cleaned}`;
    if (!tags.includes(tag) && tags.length < maxTags) {
      onChange([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === " " || e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="space-y-3">
      {onSuggest && (
        <button
          type="button"
          onClick={async () => {
            const suggestions = await onSuggest();
            if (suggestions?.length) {
              const toAdd = suggestions.filter((t) => !tags.includes(t));
              onChange([...tags, ...toAdd].slice(0, maxTags));
            }
          }}
          disabled={suggesting}
          className="rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {suggesting ? "Suggesting…" : "✦ Suggest with AI"}
        </button>
      )}

      <div className="min-h-[80px] cursor-text rounded-2xl border border-[#d7ddd4] bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-200">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-[#eef1ea] px-2.5 py-1 text-xs font-medium text-emerald-800"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-slate-400 hover:text-red-500"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          {tags.length < maxTags && (
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => addTag(input)}
              placeholder={tags.length === 0 ? "Type a hashtag and press Space" : ""}
              className="min-w-[120px] flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
          )}
        </div>
      </div>
      <p className="text-right text-[10px] text-slate-400">
        {tags.length}/{maxTags} tags
      </p>
    </div>
  );
}

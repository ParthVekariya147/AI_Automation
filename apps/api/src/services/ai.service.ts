export function suggestHashtagsFromCaption(caption: string) {
  const tokens = caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);

  const unique = Array.from(new Set(tokens)).slice(0, 8);

  return unique.map((token) => `#${token}`);
}

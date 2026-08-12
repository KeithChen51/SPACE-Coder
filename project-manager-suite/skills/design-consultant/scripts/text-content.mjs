export function normalizeTextContent(content) {
  return String(content).replace(/\r\n?/g, "\n");
}

export function sameTextContent(current, expected) {
  return normalizeTextContent(current) === normalizeTextContent(expected);
}

export function normalizeTextContent(content) {
  return String(content).replace(/\r\n?/g, "\n");
}

export function sameTextContent(current, expected) {
  return normalizeTextContent(current) === normalizeTextContent(expected);
}

const USER_FACING_CONTENT_PATTERNS = Object.freeze([
  {
    rule: "engineering-copy",
    pattern: /\b(?:TODO|FIXME|DEBUG|mock(?:ed)?[ -]?data|test[ -]?fixture|internal[ -]?only|development[ -]?only|API[ -]+(?:response|error)|stack[ -]?trace|undefined|null|NaN|\[object Object\])\b/giu,
  },
  {
    rule: "engineering-copy",
    pattern: /(?:[A-Za-z]:\\(?:[^\s<>:"|?*]+\\)+[^\s<>:"|?*]*|\/(?:src|app|packages|node_modules)\/[^\s<]+|\bat\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\()/gu,
  },
  {
    rule: "internal-data-exposure",
    pattern: /\b(?:[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|(?:internal|debug|raw)[A-Z][A-Za-z0-9]*|(?:api|http|request|response|error|trace|transport|server|backend|network)(?:Response|Error|Payload|Data)|(?:status|error|response|trace|request|user|account|order|payment|subscription|api)(?:Id|Code|Key|Type|Value))\b/gu,
  },
  {
    rule: "internal-data-exposure",
    pattern: /\{\s*["'][A-Za-z0-9_.-]+["']\s*:/gu,
  },
]);

export function findUserFacingContentLeaks(content) {
  const source = normalizeTextContent(content);
  const leaks = [];
  for (const { rule, pattern } of USER_FACING_CONTENT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      leaks.push({ rule, matched: match[0], index: match.index });
    }
  }
  return leaks.sort((left, right) => left.index - right.index || left.rule.localeCompare(right.rule));
}

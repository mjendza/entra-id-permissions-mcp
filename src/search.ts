export const DEFAULT_LIMIT = 25;

export interface SearchResult<T> {
  totalMatches: number;
  returned: number;
  /** True when more matches exist than were returned (response was capped). */
  truncated: boolean;
  results: T[];
}

// Punctuation that commonly separates parts of scope/role names
// ("UserAuthMethod-TAP.Read.All", "Sites_Selected"). Stripped on both sides so
// "UserAuthMethod-TAP", "UserAuthMethod TAP" and "userauthmethodtap" all match.
const SEPARATORS = /[-_./:\\]+/g;

const normalize = (s: string) => s.toLowerCase().replace(SEPARATORS, "");

/**
 * Build a predicate for `query`: case-insensitive, separator-insensitive, and
 * whitespace-split into terms that must ALL appear (in any of the given fields).
 * An empty query (or one made only of separators) matches everything.
 */
export function createMatcher(
  query: string,
): (haystacks: readonly (string | null | undefined)[]) => boolean {
  const terms = query.split(/\s+/).map(normalize).filter((t) => t !== "");
  if (terms.length === 0) return () => true;
  return (haystacks) => {
    // \u0000 can't occur in a term, so terms never match across field boundaries.
    const text = haystacks.filter((h): h is string => Boolean(h)).map(normalize).join("\u0000");
    return terms.every((t) => text.includes(t));
  };
}

/**
 * Case- and separator-insensitive multi-term search across the given text
 * fields of each item (see `createMatcher`). Returns at most `limit` results
 * plus the total number of matches so callers can keep responses
 * token-bounded while still signalling truncation.
 *
 * `fields` maps each item to the strings that should be matched against.
 */
export function searchRecords<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  limit: number = DEFAULT_LIMIT,
): SearchResult<T> {
  const matcher = createMatcher(query);
  const matches = items.filter((item) => matcher(fields(item)));

  return {
    totalMatches: matches.length,
    returned: Math.min(matches.length, limit),
    truncated: matches.length > limit,
    results: matches.slice(0, limit),
  };
}

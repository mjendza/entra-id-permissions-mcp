export const DEFAULT_LIMIT = 25;

export interface SearchResult<T> {
  totalMatches: number;
  returned: number;
  /** True when more matches exist than were returned (response was capped). */
  truncated: boolean;
  results: T[];
}

/**
 * Case-insensitive substring search across the given text fields of each item.
 * Returns at most `limit` results plus the total number of matches so callers
 * can keep responses token-bounded while still signalling truncation.
 *
 * `fields` maps each item to the strings that should be matched against.
 */
export function searchRecords<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
  limit: number = DEFAULT_LIMIT,
): SearchResult<T> {
  const q = query.trim().toLowerCase();
  const matches: T[] = [];

  for (const item of items) {
    if (q === "") {
      matches.push(item);
      continue;
    }
    const haystacks = fields(item);
    if (haystacks.some((h) => h && h.toLowerCase().includes(q))) {
      matches.push(item);
    }
  }

  return {
    totalMatches: matches.length,
    returned: Math.min(matches.length, limit),
    truncated: matches.length > limit,
    results: matches.slice(0, limit),
  };
}

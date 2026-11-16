export interface HistoryEntry {
  query: string;
  at: number; // epoch ms
}

const KEY = 'ip-tools:lookup-history';
const MAX = 20;

export function loadHistory(storage?: Pick<Storage, 'getItem'>): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse((storage ?? localStorage).getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is HistoryEntry =>
          !!e && typeof e.query === 'string' && e.query.length <= 300 && Number.isFinite(e.at),
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable (private mode, quota): history just isn't persisted.
  }
}

/** Adds (or moves to the top) a query and returns the new list. */
export function addHistory(entries: HistoryEntry[], query: string, now = Date.now()): HistoryEntry[] {
  const next = [{ query, at: now }, ...entries.filter((e) => e.query !== query)].slice(0, MAX);
  save(next);
  return next;
}

export function removeHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const next = entries.filter((e) => e.query !== query);
  save(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  save([]);
  return [];
}

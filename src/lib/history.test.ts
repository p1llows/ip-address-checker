import { afterEach, describe, expect, it, vi } from 'vitest';
import { addHistory, clearHistory, loadHistory, removeHistory } from './history';

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('history', () => {
  it('adds newest first, dedupes, removes and clears', () => {
    stubStorage();
    let h = loadHistory();
    h = addHistory(h, 'a.com', 1);
    h = addHistory(h, 'b.com', 2);
    h = addHistory(h, 'a.com', 3);
    expect(h.map((e) => e.query)).toEqual(['a.com', 'b.com']);
    expect(loadHistory().map((e) => e.query)).toEqual(['a.com', 'b.com']); // persisted
    h = removeHistory(h, 'b.com');
    expect(h.map((e) => e.query)).toEqual(['a.com']);
    expect(clearHistory()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });
  it('caps the list at 20 entries', () => {
    stubStorage();
    let h = loadHistory();
    for (let i = 0; i < 30; i++) h = addHistory(h, `d${i}.com`, i);
    expect(h).toHaveLength(20);
    expect(h[0].query).toBe('d29.com');
  });
  it('ignores corrupt stored data', () => {
    stubStorage();
    localStorage.setItem('ip-tools:lookup-history', '{"not":"an array"}');
    expect(loadHistory()).toEqual([]);
    localStorage.setItem('ip-tools:lookup-history', '[{"query":5},{"query":"ok.com","at":1}]');
    expect(loadHistory()).toEqual([{ query: 'ok.com', at: 1 }]);
  });
  it('does not throw when storage access itself throws (blocked site data)', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(loadHistory()).toEqual([]);
    expect(() => addHistory([], 'a.com')).not.toThrow();
    expect(() => clearHistory()).not.toThrow();
  });
});

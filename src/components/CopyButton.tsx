import { useEffect, useRef, useState } from 'react';

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure contexts / older browsers.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    try {
      await writeClipboard(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClick}
        aria-label="Copy IP address to clipboard"
      >
        {state === 'copied' ? '✓ Copied' : 'Copy'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'IP address copied to clipboard' : state === 'failed' ? 'Copy failed' : ''}
      </span>
      {state === 'failed' && (
        <span className="copy-error">Copy failed — select the text manually.</span>
      )}
    </>
  );
}

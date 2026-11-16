import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied or document not focused: fall through to the legacy path.
    }
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

export function CopyButton({ text, label = 'IP address' }: { text: string; label?: string }) {
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
        className={`btn btn-secondary btn-sm${state === 'copied' ? ' btn-copied' : state === 'failed' ? ' btn-failed' : ''}`}
        onClick={onClick}
        aria-label={`Copy ${label} to clipboard`}
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} />
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? `${label} copied to clipboard` : state === 'failed' ? 'Copy failed' : ''}
      </span>
      {state === 'failed' && (
        <span className="copy-error">Copy failed — select the text manually.</span>
      )}
    </>
  );
}

import type { SpeedPhase } from '../services/speedTestService';

const R = 84;
const C = 2 * Math.PI * R;
const ARC = C * 0.75; // 270° gauge
const MAX_MBPS = 1000;

/** Logarithmic scale so both 5 Mbps and 500 Mbps are readable. */
export function gaugeFraction(mbps: number): number {
  const f = Math.log10(1 + Math.max(0, mbps)) / Math.log10(1 + MAX_MBPS);
  return Math.min(1, f);
}

const TICKS = [1, 10, 100, 1000];

/**
 * Animated speed dial. The arc follows the live value (CSS-transitioned), an indeterminate arc
 * spins while latency is measured, and everything is static under prefers-reduced-motion.
 */
export function SpeedGauge({
  phase,
  value,
  unit,
  caption,
}: {
  phase: SpeedPhase;
  value: number | null;
  unit: string;
  caption: string;
}) {
  const transferring = phase === 'download' || phase === 'upload';
  const scanning = phase === 'checking' || phase === 'latency';
  const frac = value !== null ? gaugeFraction(value) : 0;

  return (
    <div className={`gauge gauge-${phase}`} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <g transform="rotate(135 100 100)">
          <circle className="gauge-track" cx="100" cy="100" r={R} strokeDasharray={`${ARC} ${C}`} />
          <circle
            className="gauge-value"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={`${ARC} ${C}`}
            strokeDashoffset={ARC * (1 - frac)}
          />
        </g>
        {scanning && (
          <circle
            className="gauge-scan"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={`${C * 0.12} ${C}`}
          />
        )}
        {TICKS.map((t) => {
          // Place tick labels along the 270° arc, starting at 135° (bottom-left).
          const angle = ((135 + gaugeFraction(t) * 270) * Math.PI) / 180;
          const r = R + 14;
          return (
            <text
              key={t}
              className="gauge-tick"
              x={100 + r * Math.cos(angle)}
              y={100 + r * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {t}
            </text>
          );
        })}
      </svg>
      <div className="gauge-readout">
        <span className="gauge-number mono">{value !== null ? value.toFixed(value >= 100 ? 0 : 1) : '—'}</span>
        <span className="gauge-unit">{value !== null ? unit : ''}</span>
        <span className="gauge-caption">
          {transferring && <span className="pulse-dot" />}
          {caption}
        </span>
      </div>
    </div>
  );
}

const STEPS: Array<{ phase: SpeedPhase; label: string }> = [
  { phase: 'latency', label: 'Latency' },
  { phase: 'download', label: 'Download' },
  { phase: 'upload', label: 'Upload' },
];
const ORDER: SpeedPhase[] = ['idle', 'checking', 'latency', 'download', 'upload', 'done'];

/** Progress steps with an animated active marker. State is conveyed with text as well as style. */
export function SpeedSteps({ phase }: { phase: SpeedPhase }) {
  const idx = ORDER.indexOf(phase);
  return (
    <ol className="speed-steps">
      {STEPS.map((s) => {
        const sIdx = ORDER.indexOf(s.phase);
        const state = phase === 'done' || idx > sIdx ? 'done' : idx === sIdx ? 'active' : 'pending';
        return (
          <li key={s.phase} className={`speed-step step-${state}`}>
            <span className="step-marker" aria-hidden="true">
              {state === 'done' ? '✓' : state === 'active' ? <span className="pulse-dot" /> : ''}
            </span>
            <span>
              {s.label}
              <span className="sr-only">{` — ${state === 'done' ? 'complete' : state === 'active' ? 'in progress' : 'waiting'}`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

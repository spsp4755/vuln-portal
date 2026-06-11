import React from 'react';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const styleMap: Record<Severity, string> = {
  CRITICAL: 'badge-critical',
  HIGH:     'badge-high',
  MEDIUM:   'badge-medium',
  LOW:      'badge-low',
};

export const SeverityBadge: React.FC<{ severity: Severity; score?: number }> = ({
  severity,
  score,
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${styleMap[severity] ?? 'badge-low'}`}
    style={{ fontSize: '12px' }}
  >
    {severity}
    {score !== undefined && score !== null && (
      <span className="opacity-70">{Number(score).toFixed(1)}</span>
    )}
  </span>
);

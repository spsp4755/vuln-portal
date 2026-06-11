import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4" style={{ opacity: 1 - i * 0.12 }}>
        <div className="skeleton h-10 flex-1" />
        <div className="skeleton h-10 w-24" />
        <div className="skeleton h-10 w-16" />
      </div>
    ))}
  </div>
);

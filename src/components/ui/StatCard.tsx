import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  color: string;
  icon?: React.ReactNode;
  subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, color, icon, subtitle }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {icon && <div className="text-2xl">{icon}</div>}
    </div>
  </div>
);

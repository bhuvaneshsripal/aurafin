import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  trend?: { value: string; positive: boolean };
  icon?: ReactNode;
}

export default function StatCard({ label, value, sublabel, trend, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-base text-slate-500 font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span
            className={`text-sm font-medium ${trend.positive ? 'text-brand-600' : 'text-red-500'}`}
          >
            {trend.positive ? '▲' : '▼'} {trend.value}
          </span>
        )}
        {sublabel && <span className="text-sm text-slate-400">{sublabel}</span>}
      </div>
    </div>
  );
}

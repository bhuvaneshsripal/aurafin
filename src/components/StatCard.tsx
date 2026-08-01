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
    <div className="card group bg-white rounded-2xl border border-slate-200 p-6 shadow-soft transition-all duration-200 hover:shadow-soft-md hover:scale-[1.02]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] text-slate-500 font-medium">{label}</span>
        {icon && (
          <span className="text-brand-600 bg-brand-50 rounded-xl p-2 flex items-center justify-center">
            {icon}
          </span>
        )}
      </div>
      <div className="text-[32px] leading-tight font-bold text-slate-900 font-numeric">{value}</div>
      <div className="flex items-center gap-2 mt-1.5">
        {trend && (
          <span
            className={`text-[13px] font-semibold ${trend.positive ? 'text-brand-600' : 'text-red-600'}`}
          >
            {trend.positive ? '▲' : '▼'} {trend.value}
          </span>
        )}
        {sublabel && <span className="text-[13px] text-slate-400">{sublabel}</span>}
      </div>
    </div>
  );
}

"use client";

interface KPIProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
}

export default function KPI({ label, value, subtitle, icon }: KPIProps) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-200 hover:scale-[1.02]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-600 font-semibold uppercase tracking-wide">{label}</div>
        {icon && <div className="text-gray-400 flex-shrink-0">{icon}</div>}
      </div>
      <div className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{value}</div>
      {subtitle && <div className="mt-2 text-xs text-gray-500 font-medium">{subtitle}</div>}
    </div>
  );
}


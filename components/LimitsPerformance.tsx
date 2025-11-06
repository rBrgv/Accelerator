"use client";

import { OrgProfile } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface LimitsPerformanceProps {
  orgProfile: OrgProfile;
  scanDuration?: number;
  scanDurationSeconds?: number;
}

export default function LimitsPerformance({ orgProfile, scanDuration, scanDurationSeconds }: LimitsPerformanceProps) {
  const limits = orgProfile.limits || {};
  
  // Key limits to display
  const keyLimits = [
    { key: "DailyApiRequests", label: "Daily API Requests", used: limits.DailyApiRequests?.Used, max: limits.DailyApiRequests?.Max },
    { key: "DailyAsyncApexExecutions", label: "Daily Async Apex", used: limits.DailyAsyncApexExecutions?.Used, max: limits.DailyAsyncApexExecutions?.Max },
    { key: "DailyBulkApiRequests", label: "Daily Bulk API", used: limits.DailyBulkApiRequests?.Used, max: limits.DailyBulkApiRequests?.Max },
    { key: "DataStorageMB", label: "Data Storage (MB)", used: limits.DataStorageMB?.Used, max: limits.DataStorageMB?.Max },
    { key: "FileStorageMB", label: "File Storage (MB)", used: limits.FileStorageMB?.Used, max: limits.FileStorageMB?.Max },
  ].filter(l => l.used !== undefined || l.max !== undefined);
  
  const calculatePercentage = (used?: number, max?: number) => {
    if (!used || !max) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  };
  
  const getColorClass = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-orange-500";
    if (percentage >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };
  
  return (
    <CollapsibleSection title="Limits & Performance Signals" defaultOpen={false}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {scanDurationSeconds && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-600">Scan Duration</div>
              <div className="text-2xl font-bold text-blue-900">{scanDurationSeconds.toFixed(1)}s</div>
              <div className="text-xs text-gray-500 mt-1">{scanDuration ? `${(scanDuration / 1000).toFixed(0)}ms` : ""}</div>
            </div>
          )}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">API Version</div>
            <div className="text-2xl font-bold text-gray-900">{orgProfile.apiVersion}</div>
            <div className="text-xs text-gray-500 mt-1">Current API version</div>
          </div>
        </div>
        
        {keyLimits.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Org Limits Usage</h4>
            <div className="space-y-4">
              {keyLimits.map(limit => {
                const percentage = calculatePercentage(limit.used, limit.max);
                return (
                  <div key={limit.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{limit.label}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {limit.used?.toLocaleString() || "—"} / {limit.max?.toLocaleString() || "—"}
                      </span>
                    </div>
                    {limit.used !== undefined && limit.max !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getColorClass(percentage)}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    )}
                    {limit.used !== undefined && limit.max !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">{percentage}% used</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}


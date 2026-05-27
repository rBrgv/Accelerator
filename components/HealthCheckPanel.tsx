"use client";

import { useState } from "react";
import { HealthComputation, ScanOutput } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface HealthCheckPanelProps {
  health?: HealthComputation;
  scanId?: string;
  scanData?: ScanOutput;
}

export default function HealthCheckPanel({ health, scanId, scanData }: HealthCheckPanelProps) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!health) return null;

  const priorityRisks = health.categories
    .flatMap((c) =>
      (c.kpis || [])
        .filter((k) => k.status === "RISK" || k.status === "MONITOR")
        .map((k) => ({ category: c.label, ...k }))
    )
    .slice(0, 10);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HEALTHY": return "text-green-600 bg-green-50 border-green-200";
      case "MONITOR": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "RISK":    return "text-red-600 bg-red-50 border-red-200";
      default:        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-500";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const handleDownload = async () => {
    if (!scanData && !scanId) {
      setDownloadError("No scan data available. Please run a scan first.");
      return;
    }
    setIsDownloading(true);
    setDownloadError(null);
    try {
      let response: Response;
      if (scanData) {
        response = await fetch("/api/reports/health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(scanData),
        });
      } else {
        response = await fetch(`/api/reports/health?scanId=${scanId}`);
      }

      if (!response.ok) {
        let message = `Server error: ${response.status}`;
        try {
          const ct = response.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const json = await response.json();
            message = json.error || message;
          } else {
            const text = await response.text();
            if (text) message = text;
          }
        } catch { /* use default message */ }
        throw new Error(message);
      }

      const cd = response.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename\*=UTF-8''(.+)/);
      const today = new Date().toISOString().split("T")[0];
      const filename = match ? decodeURIComponent(match[1]) : `health-audit-${today}.html`;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setDownloadError(err.message || "Failed to download health audit report.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <CollapsibleSection title="Salesforce Health Check" defaultOpen={true}>
      <div className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <h3 className="text-lg font-semibold text-gray-900">Overall Health Score</h3>
          <div className={`text-3xl font-bold ${getScoreColor(health.overallScore)}`}>
            {health.overallScore != null ? `${health.overallScore}%` : "n/a"}
          </div>
        </div>

        {/* Category Scores Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {health.categories?.map((c) => (
            <div key={c.key} className="rounded-xl border p-3 bg-white hover:shadow-md transition-shadow">
              <div className="text-sm text-gray-600 mb-1">{c.label}</div>
              <div className={`text-xl font-semibold ${getScoreColor(c.score)}`}>
                {c.score != null ? `${c.score}%` : "n/a"}
              </div>
            </div>
          ))}
        </div>

        {/* Priority Risks */}
        {priorityRisks.length > 0 && (
          <div className="mt-6">
            <h3 className="text-base font-semibold mb-3 text-gray-900">Priority Risks</h3>
            <ul className="space-y-2">
              {priorityRisks.map((k, idx) => (
                <li
                  key={`${k.category}:${k.key}:${idx}`}
                  className={`p-3 rounded-lg border ${getStatusColor(k.status)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{k.label}</div>
                      {k.value !== null && k.value !== undefined && (
                        <div className="text-sm mt-1 opacity-90">
                          Current: {typeof k.value === "number" ? k.value.toLocaleString() : k.value}
                        </div>
                      )}
                      {k.detail && <div className="text-xs mt-1 opacity-75">{k.detail}</div>}
                    </div>
                    <span className="ml-3 text-xs font-medium uppercase">
                      {k.status === "RISK" ? "High Risk" : "Monitor"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Download Report */}
        <div className="mt-6 border-t pt-4">
          {downloadError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{downloadError}</span>
            </div>
          )}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 text-sm border border-blue-300 rounded-lg px-3 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDownloading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Health Audit Report
              </>
            )}
          </button>
        </div>

        {/* Methodology */}
        <div className="mt-4 border-t pt-4">
          <button
            onClick={() => setMethodologyOpen(!methodologyOpen)}
            className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center gap-2"
          >
            How this is calculated
            <svg
              className={`w-4 h-4 transition-transform ${methodologyOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {methodologyOpen && (
            <div className="mt-3 text-sm space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div>
                <strong>Category Weights:</strong> Governance {health.methodology.weights.governance}%,
                Automation {health.methodology.weights.automation}%, Data {health.methodology.weights.data}%,
                Security {health.methodology.weights.security}%, Limits {health.methodology.weights.limits}%.
              </div>
              <div>
                <strong>Status Points:</strong> Healthy={health.methodology.statusToPoints.HEALTHY},
                Monitor={health.methodology.statusToPoints.MONITOR}, Risk={health.methodology.statusToPoints.RISK},
                N/A={health.methodology.statusToPoints.NA}.
              </div>
              <div>
                Category score = (sum of status points / maximum possible points) × 100. Overall score is the
                weighted average of available categories.
              </div>
              {Array.isArray(health.methodology.notes) && health.methodology.notes.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  {health.methodology.notes.map((n: string, i: number) => (
                    <li key={i} className="text-gray-700">{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

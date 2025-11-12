"use client";

import { useState } from "react";
import { HealthComputation } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface HealthCheckPanelProps {
  health?: HealthComputation;
  scanId?: string;
  scanData?: any;
}

export default function HealthCheckPanel({ health, scanId, scanData }: HealthCheckPanelProps) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // Debug logging
  if (typeof window !== "undefined" && !health) {
    console.log("[HealthCheckPanel] No health data provided");
  } else if (typeof window !== "undefined" && health) {
    console.log("[HealthCheckPanel] Health data received:", {
      overallScore: health.overallScore,
      categoriesCount: health.categories?.length,
    });
  }

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
      case "HEALTHY":
        return "text-green-600 bg-green-50 border-green-200";
      case "MONITOR":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "RISK":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-500";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
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
            <div
              key={c.key}
              className="rounded-xl border p-3 bg-white hover:shadow-md transition-shadow"
            >
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
                      {k.detail && (
                        <div className="text-xs mt-1 opacity-75">{k.detail}</div>
                      )}
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
          <button
            onClick={async () => {
              if (!scanData) {
                console.error("No scan data available");
                return;
              }
              try {
                const response = await fetch(`/api/reports/health`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(scanData),
                });
                
                if (!response.ok) {
                  const contentType = response.headers.get("content-type");
                  let errorMessage = "Failed to generate report";
                  try {
                    if (contentType && contentType.includes("application/json")) {
                      const data = await response.json();
                      errorMessage = data.error || `Server error: ${response.status}`;
                    } else {
                      const text = await response.text();
                      errorMessage = text || `Server error: ${response.status}`;
                    }
                  } catch (parseError) {
                    errorMessage = `Server error: ${response.status}`;
                  }
                  throw new Error(errorMessage);
                }

                // Get filename from Content-Disposition header
                const contentDisposition = response.headers.get("Content-Disposition");
                let filename = `health-audit-${new Date().toISOString().split("T")[0]}.html`;
                if (contentDisposition) {
                  const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
                  if (filenameMatch) {
                    filename = decodeURIComponent(filenameMatch[1]);
                  }
                }

                // Download the file
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
                console.error("Failed to download health report", err);
                alert(err.message || "Failed to download health audit report");
              }
            }}
            className="text-sm border border-blue-300 rounded-lg px-3 py-1.5 inline-block text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Download Health Audit Report
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {methodologyOpen && (
            <div className="mt-3 text-sm space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div>
                <strong>Category Weights:</strong> Governance {health.methodology.weights.governance}%, Automation{" "}
                {health.methodology.weights.automation}%, Data {health.methodology.weights.data}%, Security{" "}
                {health.methodology.weights.security}%, Limits {health.methodology.weights.limits}%.
              </div>
              <div>
                <strong>Status Points:</strong> Healthy={health.methodology.statusToPoints.HEALTHY}, Monitor=
                {health.methodology.statusToPoints.MONITOR}, Risk={health.methodology.statusToPoints.RISK}, N/A=
                {health.methodology.statusToPoints.NA}.
              </div>
              <div>
                Category score = (sum of status points / maximum possible points) × 100. Overall score is the
                weighted average of available categories.
              </div>
              {Array.isArray(health.methodology.notes) && health.methodology.notes.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  {health.methodology.notes.map((n: string, i: number) => (
                    <li key={i} className="text-gray-700">
                      {n}
                    </li>
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


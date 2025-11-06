"use client";

import { Finding } from "@/lib/types";
import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";

interface FindingsPanelProps {
  findings: Finding[];
}

export default function FindingsPanel({ findings }: FindingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "high" | "medium" | "low" | "byCategory">("overview");
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());

  const highFindings = findings.filter((f) => f.severity === "HIGH");
  const mediumFindings = findings.filter((f) => f.severity === "MEDIUM");
  const lowFindings = findings.filter((f) => f.severity === "LOW");

  // Group by category
  const findingsByCategory = findings.reduce((acc, finding) => {
    const category = finding.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(finding);
    return acc;
  }, {} as Record<string, Finding[]>);

  // Find most affected objects
  const objectImpactCount = findings.reduce((acc, finding) => {
    finding.objects.forEach(obj => {
      acc[obj] = (acc[obj] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const topAffectedObjects = Object.entries(objectImpactCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Collect all remediation steps
  const allRemediationSteps = new Set<string>();
  findings.forEach(f => {
    f.remediation.forEach(step => allRemediationSteps.add(step));
  });

  const toggleFinding = (findingId: string) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId);
    } else {
      newExpanded.add(findingId);
    }
    setExpandedFindings(newExpanded);
  };

  if (findings.length === 0) {
    return (
      <CollapsibleSection title="Migration Findings" defaultOpen={true}>
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-green-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">No migration blockers detected!</span>
          </div>
        </div>
      </CollapsibleSection>
    );
  }

  const renderFindingCard = (finding: Finding, isExpanded: boolean) => {
    const severityColors = {
      HIGH: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-800", text: "text-red-700" },
      MEDIUM: { bg: "bg-yellow-50", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-800", text: "text-yellow-700" },
      LOW: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-800", text: "text-blue-700" },
    };
    const colors = severityColors[finding.severity];

    return (
      <div key={finding.id} className={`border rounded-lg ${colors.border} ${colors.bg} mb-3`}>
        <button
          onClick={() => toggleFinding(finding.id)}
          className="w-full px-4 py-3 flex items-start justify-between text-left hover:bg-opacity-80 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${colors.badge}`}>
                {finding.severity}
              </span>
              <span className="text-xs text-gray-500">{finding.category}</span>
            </div>
            <h5 className="font-medium text-gray-900 break-words">{finding.title}</h5>
            {finding.objects.length > 0 && (
              <div className="text-xs text-gray-600 mt-1">
                {finding.objects.length} object{finding.objects.length !== 1 ? "s" : ""}: {finding.objects.slice(0, 3).join(", ")}
                {finding.objects.length > 3 && ` +${finding.objects.length - 3} more`}
              </div>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-200 pt-3 space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Description</div>
              <div className="text-sm text-gray-600">{finding.description}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Impact</div>
              <div className="text-sm text-gray-600">{finding.impact}</div>
            </div>
            {finding.remediation.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Remediation Steps</div>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {finding.remediation.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
            {finding.objects.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Affected Objects</div>
                <div className="flex flex-wrap gap-1">
                  {finding.objects.map(obj => (
                    <span key={obj} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded font-mono">
                      {obj}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <CollapsibleSection title="Migration Findings" defaultOpen={true}>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Summary Cards */}
        <div className="p-6 border-b bg-gradient-to-r from-red-50 to-orange-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Total Findings</div>
              <div className="text-2xl font-bold text-gray-900">{findings.length}</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">High Severity</div>
              <div className="text-2xl font-bold text-red-900">{highFindings.length}</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Medium Severity</div>
              <div className="text-2xl font-bold text-yellow-900">{mediumFindings.length}</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Categories</div>
              <div className="text-2xl font-bold text-blue-900">{Object.keys(findingsByCategory).length}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex space-x-1 px-6 overflow-x-auto">
            {[
              { id: "overview" as const, label: "Overview" },
              { id: "high" as const, label: `High (${highFindings.length})` },
              { id: "medium" as const, label: `Medium (${mediumFindings.length})` },
              { id: "low" as const, label: `Low (${lowFindings.length})` },
              { id: "byCategory" as const, label: "By Category" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-red-500 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[600px] overflow-y-auto">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Risk Summary */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Risk Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-xs text-gray-600">Critical Issues</div>
                    <div className="text-lg font-bold text-red-900">{highFindings.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Requires immediate attention</div>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-xs text-gray-600">Moderate Issues</div>
                    <div className="text-lg font-bold text-yellow-900">{mediumFindings.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Plan for remediation</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-gray-600">Low Priority</div>
                    <div className="text-lg font-bold text-blue-900">{lowFindings.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Monitor and review</div>
                  </div>
                </div>
              </div>

              {/* Findings by Category */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Findings by Category</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(findingsByCategory)
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([category, categoryFindings]) => (
                      <div key={category} className="p-3 bg-gray-50 rounded-lg border">
                        <div className="text-xs text-gray-600">{category}</div>
                        <div className="text-lg font-bold text-gray-900">{categoryFindings.length}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {categoryFindings.filter(f => f.severity === "HIGH").length} high
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Most Affected Objects */}
              {topAffectedObjects.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Most Affected Objects</h4>
                  <div className="space-y-2">
                    {topAffectedObjects.map(([obj, count]) => (
                      <div key={obj} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <span className="font-medium font-mono">{obj}</span>
                        <span className="text-gray-600">{count} finding{count !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Remediation Actions */}
              {allRemediationSteps.size > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Common Remediation Actions</h4>
                  <div className="space-y-1">
                    {Array.from(allRemediationSteps).slice(0, 8).map((step, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 rounded text-sm text-gray-700">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "high" && (
            <div className="space-y-3">
              {highFindings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No high severity findings</div>
              ) : (
                highFindings.map(f => renderFindingCard(f, expandedFindings.has(f.id)))
              )}
            </div>
          )}

          {activeTab === "medium" && (
            <div className="space-y-3">
              {mediumFindings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No medium severity findings</div>
              ) : (
                mediumFindings.map(f => renderFindingCard(f, expandedFindings.has(f.id)))
              )}
            </div>
          )}

          {activeTab === "low" && (
            <div className="space-y-3">
              {lowFindings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No low severity findings</div>
              ) : (
                lowFindings.map(f => renderFindingCard(f, expandedFindings.has(f.id)))
              )}
            </div>
          )}

          {activeTab === "byCategory" && (
            <div className="space-y-4">
              {Object.entries(findingsByCategory)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([category, categoryFindings]) => (
                  <div key={category} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">{category}</h4>
                      <span className="text-sm text-gray-600">{categoryFindings.length} finding{categoryFindings.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-2">
                      {categoryFindings.map(f => renderFindingCard(f, expandedFindings.has(f.id)))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}


"use client";

import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import { ScanOutput } from "@/lib/types";

interface ReportGeneratorProps {
  scanId?: string;
  scanData?: ScanOutput;
}

async function downloadReport(
  endpoint: string,
  scanId: string | undefined,
  scanData: ScanOutput | undefined,
  defaultFilename: string
): Promise<void> {
  if (!scanData && !scanId) throw new Error("No scan data available. Please run a scan first.");

  let response: Response;

  // Always prefer POST with in-memory scanData — avoids serverless Map misses.
  // Fall back to GET with scanId only when scanData isn't available (e.g. page reload).
  if (scanData) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanData),
    });
  } else {
    response = await fetch(`${endpoint}?scanId=${scanId}`);
  }

  if (!response.ok) {
    let message = `Server error: ${response.status} ${response.statusText}`;
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
  const filename = match ? decodeURIComponent(match[1]) : defaultFilename;

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export default function ReportGenerator({ scanId, scanData }: ReportGeneratorProps) {
  const [isGeneratingExecutive, setIsGeneratingExecutive] = useState(false);
  const [isGeneratingTechnical, setIsGeneratingTechnical] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const handleDownloadExecutive = async () => {
    setIsGeneratingExecutive(true);
    setError(null);
    try {
      await downloadReport(
        "/api/reports/executive",
        scanId,
        scanData,
        `executive-readiness-summary-${today}.pdf`
      );
    } catch (err: any) {
      setError(err.message || "Failed to generate executive report.");
    } finally {
      setIsGeneratingExecutive(false);
    }
  };

  const handleDownloadTechnical = async () => {
    setIsGeneratingTechnical(true);
    setError(null);
    try {
      await downloadReport(
        "/api/reports/technical?format=html",
        scanId,
        scanData,
        `technical-report-${today}.html`
      );
    } catch (err: any) {
      setError(err.message || "Failed to generate technical report.");
    } finally {
      setIsGeneratingTechnical(false);
    }
  };

  if (!scanId && !scanData) {
    return (
      <CollapsibleSection title="Migration Reports" defaultOpen={false}>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-center py-8 text-gray-500">
            <p>Please run a scan first to generate reports.</p>
          </div>
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Migration Reports" defaultOpen={false}>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-600">
              Download executive summary and technical reports for migration planning and analysis.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg text-red-800 text-sm flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Executive Report */}
            <div className="border-2 border-blue-100 rounded-xl p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Executive Summary Report</h3>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                    Migration readiness summary with KPIs, key risks, and leadership actions. PDF format.
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1.5 bg-white/60 rounded-lg p-3">
                    {["Migration Health Snapshot with KPIs", "Executive Summary (3–4 sentences)", "Key Risks (4–6 major blockers)", "Recommended Leadership Actions", "Migration Readiness Score"].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={handleDownloadExecutive}
                disabled={isGeneratingExecutive}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isGeneratingExecutive ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Executive Report (PDF)
                  </>
                )}
              </button>
            </div>

            {/* Technical Report */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Technical Report</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Detailed technical analysis for engineering and architecture teams. HTML format.
                </p>
                <ul className="text-xs text-gray-600 space-y-1.5 bg-white/60 rounded-lg p-3">
                  {["Metadata Inventory (Objects, Fields, Relationships)", "Automation Deep Dive (Flows, Triggers, Validation Rules)", "Data Inventory & High-Volume Objects", "Findings with Technical Remediation Plans", "Migration Impacts & Dependency Notes"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={handleDownloadTechnical}
                disabled={isGeneratingTechnical}
                className="w-full px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-semibold hover:from-gray-700 hover:to-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isGeneratingTechnical ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Technical Report (HTML)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

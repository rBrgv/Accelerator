"use client";

import { useState, useEffect } from "react";
import { ScanOutput } from "@/lib/types";
import ConnectCard from "@/components/ConnectCard";
import KPI from "@/components/KPI";
import ObjectsTable from "@/components/ObjectsTable";
import ErrorBanner from "@/components/ErrorBanner";
import AutomationSummary from "@/components/AutomationSummary";
import AutomationKpis from "@/components/AutomationKpis";
import FindingsPanel from "@/components/FindingsPanel";
import SecuritySummary from "@/components/SecuritySummary";
import IntegrationSummary from "@/components/IntegrationSummary";
import DeploymentSequence from "@/components/DeploymentSequence";
import DataDeploymentSequence from "@/components/DataDeploymentSequence";
import CollapsibleSection from "@/components/CollapsibleSection";
import DataQuality from "@/components/DataQuality";
import LimitsPerformance from "@/components/LimitsPerformance";
import ReportGenerator from "@/components/ReportGenerator";
import { migrationPrerequisites } from "@/server/inventory/prerequisites";

type ConnectionStatus = "checking" | "connected" | "disconnected";

const SCAN_STEPS = [
  "Initializing scan...",
  "Scanning org profile...",
  "Discovering objects...",
  "Scanning flows and automation...",
  "Scanning Apex code...",
  "Scanning reports and dashboards...",
  "Analyzing ownership...",
  "Identifying packages...",
  "Generating findings...",
  "Finalizing scan...",
];

export default function DashboardPage() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [scanData, setScanData] = useState<ScanOutput | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>("");
  const [scanDuration, setScanDuration] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; traceId?: string } | null>(null);

  useEffect(() => {
    checkConnection();
    
    // Handle URL params for success/error
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setError(null);
      checkConnection();
    }
    if (params.get("error")) {
      setError({ message: decodeURIComponent(params.get("error")!) });
    }
  }, []);

  async function checkConnection() {
    try {
      const response = await fetch("/api/user/info");
      if (response.ok) {
        setConnectionStatus("connected");
      } else {
        setConnectionStatus("disconnected");
      }
    } catch {
      setConnectionStatus("disconnected");
    }
  }

  async function handleDisconnect() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setConnectionStatus("disconnected");
      setScanData(null);
      setError(null);
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  async function handleRunScan() {
    setIsScanning(true);
    setError(null);
    setScanData(null);
    setScanDuration(null);
    setScanProgress("");

    let currentStep = 0;
    const progressInterval = setInterval(() => {
      if (currentStep < SCAN_STEPS.length) {
        setScanProgress(SCAN_STEPS[currentStep]);
        currentStep++;
      }
    }, 1000);

    try {
      const response = await fetch("/api/scan", { method: "POST" });
      const data = await response.json();

      clearInterval(progressInterval);
      setScanProgress("Scan complete!");

      if (!response.ok) {
        if (response.status === 401) {
          setError({
            message: data.error || "Access token expired. Please reconnect to Salesforce.",
            traceId: data.traceId,
          });
          setTimeout(() => {
            handleDisconnect();
          }, 2000);
          return;
        }
        setError({ message: data.error || "Scan failed", traceId: data.traceId });
        return;
      }

      // Check if scan returned meaningful data
      if (data && data.inventory && data.inventory.sourceObjects) {
        const objectsWithData = data.inventory.sourceObjects.filter(
          (obj: any) => obj.recordCount !== undefined || (obj.fields && obj.fields.length > 0)
        );

        if (objectsWithData.length === 0 && data.summary && data.summary.objects === 0) {
          setError({
            message: "Scan completed but no data was retrieved. Your access token may have expired. Please disconnect and reconnect to Salesforce to refresh your session.",
          });
          return;
        }
      }

      setScanData(data);
      setScanDuration(data.scanDurationSeconds || null);
    } catch (err) {
      clearInterval(progressInterval);
      setError({ message: "Failed to run scan. Please try again." });
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanProgress(""), 2000);
    }
  }

  if (connectionStatus === "checking") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <div className="text-gray-500">Checking connection...</div>
        </div>
      </main>
    );
  }

  if (connectionStatus === "disconnected") {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Salesforce Org Migration Accelerator</h1>
          <ConnectCard />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Salesforce Org Migration Accelerator</h1>
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Disconnect
          </button>
        </div>

        {error && (
          <ErrorBanner
            message={error.message}
            traceId={error.traceId}
            onDismiss={() => setError(null)}
          />
        )}

        {scanDuration && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">
                Scan completed in {scanDuration.toFixed(1)} seconds
              </span>
              {scanData?.scanId && (
                <span className="ml-auto text-xs text-green-600 font-mono">
                  ID: {scanData.scanId}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mb-6">
          <button
            onClick={handleRunScan}
            disabled={isScanning}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isScanning ? "Scanning..." : "Run Scan"}
          </button>
        </div>

        {isScanning && scanProgress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-blue-800 font-medium">{scanProgress}</span>
            </div>
          </div>
        )}

        {scanData && (
          <>
            {/* Enhanced Top KPIs Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              <KPI
                label="Edition"
                value={scanData.source.edition || "Unknown"}
                subtitle={scanData.source.organization?.isSandbox ? "Sandbox" : "Production"}
              />
              <KPI
                label="Total Records"
                value={scanData.summary.recordsApprox.toLocaleString()}
              />
              <KPI
                label="Objects Scanned"
                value={scanData.summary.objects}
                subtitle={`${scanData.inventory.sourceObjects.filter(o => o.isCustom).length} custom, ${scanData.inventory.sourceObjects.filter(o => !o.isCustom).length} standard`}
              />
              <KPI
                label="High-Volume Objects"
                value={scanData.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 100000).length}
                subtitle={`${scanData.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 1000000).length} ≥1M`}
              />
            </div>
            
            {/* Secondary KPIs Row */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-8">
              <KPI
                label="Apex Classes"
                value={scanData.inventory.code.apexClasses.length}
                subtitle={`${scanData.inventory.code.apexTriggers.length} triggers`}
              />
              <KPI
                label="Reports"
                value={scanData.inventory.reporting.reports.length}
                subtitle={`${scanData.inventory.reporting.dashboards.length} dashboards`}
              />
            </div>

            {scanData.inventory.security && (
              <div className="mb-6">
                <SecuritySummary security={scanData.inventory.security} />
              </div>
            )}

            {scanData.inventory.integrations && (
              <div className="mb-6">
                <IntegrationSummary integrations={scanData.inventory.integrations} />
              </div>
            )}

            <AutomationKpis automation={scanData.inventory.automation} />

            <div className="mb-6">
              <ObjectsTable 
                objects={scanData.inventory.sourceObjects} 
                automation={scanData.inventory.automation}
              />
            </div>

            <div className="mb-6">
              <AutomationSummary automation={scanData.inventory.automation} />
            </div>

            {scanData.findings.length > 0 && (
              <div className="mb-6">
                <FindingsPanel findings={scanData.findings} />
              </div>
            )}

            <div className="mb-6">
              <CollapsibleSection title="Migration Prerequisites" defaultOpen={false}>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Pre-deployment checklist items to configure before starting metadata deployment.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Prerequisite</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {migrationPrerequisites.map((prereq) => (
                          <tr key={prereq.no} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{prereq.no}</td>
                            <td className="px-4 py-2 font-medium">{prereq.name}</td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  prereq.status === "Done"
                                    ? "bg-green-100 text-green-800"
                                    : prereq.status === "Pending"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : prereq.status === "Not Started"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {prereq.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{prereq.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CollapsibleSection>
            </div>

            <div className="mb-6">
              <DataQuality scanData={scanData} />
            </div>

            <div className="mb-6">
              <LimitsPerformance 
                orgProfile={scanData.source} 
                scanDuration={scanDuration ? scanDuration * 1000 : undefined}
                scanDurationSeconds={scanDuration ?? undefined}
              />
            </div>

            <div className="mb-6">
              <DeploymentSequence />
            </div>

            <div className="mb-6">
              <DataDeploymentSequence />
            </div>

            <div className="mb-6">
              <ReportGenerator scanId={scanData.scanId} scanData={scanData} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

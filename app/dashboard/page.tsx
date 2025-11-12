"use client";

import { useState, useEffect } from "react";
import { ScanOutput } from "@/lib/types";
import ConnectCard from "@/components/ConnectCard";
import KPI from "@/components/KPI";
import ObjectsTable from "@/components/ObjectsTable";
import ErrorBanner from "@/components/ErrorBanner";
import AutomationSummary from "@/components/AutomationSummary";
import FindingsPanel from "@/components/FindingsPanel";
import SecuritySummary from "@/components/SecuritySummary";
import IntegrationSummary from "@/components/IntegrationSummary";
import DeploymentSequence from "@/components/DeploymentSequence";
import DataDeploymentSequence from "@/components/DataDeploymentSequence";
import CollapsibleSection from "@/components/CollapsibleSection";
import DataQuality from "@/components/DataQuality";
import ReportGenerator from "@/components/ReportGenerator";
import CodeCoveragePanel from "@/components/CodeCoveragePanel";
import HealthCheckPanel from "@/components/HealthCheckPanel";
import { migrationPrerequisites } from "@/server/inventory/prerequisites";

type ConnectionStatus = "checking" | "connected" | "disconnected";

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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
    // Attempt to call logout API, but proceed with disconnect regardless of result
    try {
      const response = await fetch("/api/auth/logout", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }).catch((fetchError) => {
        // Network errors (CORS, offline, etc.) are caught here
        console.warn("Logout API network error, proceeding with disconnect:", fetchError);
        return null;
      });
      
      if (response && !response.ok) {
        console.warn(`Logout API returned ${response.status}, proceeding with disconnect`);
      }
    } catch (err) {
      // Any other errors
      console.warn("Logout API call failed, proceeding with disconnect:", err);
    }
    
    // Always proceed with disconnect in UI (fire and forget)
    performDisconnect();
  }

  function performDisconnect() {
    try {
      setConnectionStatus("disconnected");
      setScanData(null);
      setError(null);
      // Use setTimeout to ensure state updates before navigation
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 0);
    } catch (err) {
      // If state updates fail, force navigation
      console.warn("Error during disconnect, forcing navigation:", err);
      window.location.href = "/dashboard";
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
      if (data && data.inventory) {
        // Check if org info is missing (indicates auth issue)
        if (!data.source?.orgId || data.source?.edition === "Unknown") {
          setError({
            message: "Unable to retrieve organization information. Your access token may have expired. Please disconnect and reconnect to Salesforce.",
          });
          return;
        }
        
        // Check if we have any data at all
        const hasAnyData = 
          (data.inventory.sourceObjects && data.inventory.sourceObjects.length > 0) ||
          (data.inventory.automation && (data.inventory.automation.flows?.length > 0 || data.inventory.automation.triggers?.length > 0)) ||
          (data.inventory.code && (data.inventory.code.apexClasses?.length > 0 || data.inventory.code.apexTriggers?.length > 0)) ||
          (data.inventory.reporting && data.inventory.reporting.reports?.length > 0) ||
          (data.summary && data.summary.objects > 0);

        if (!hasAnyData) {
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
          <h1 className="text-3xl font-bold mb-6 text-center">Salesforce Org Migration Accelerator</h1>
          <ConnectCard />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/logo-icon.jpeg" 
              alt="Logo" 
              className="h-10 w-10 object-contain flex-shrink-0"
              onError={(e) => {
                // Fallback if logo doesn't exist
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h1 className="text-3xl font-bold">Salesforce Org Migration Accelerator</h1>
          </div>
          <button
            onClick={handleDisconnect}
            className="px-5 py-2.5 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-lg hover:from-gray-200 hover:to-gray-300 font-medium shadow-sm hover:shadow-md transition-all duration-200 border border-gray-300"
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
                label="Organization"
                value={scanData.source.organizationName || "Unknown"}
                subtitle={`${scanData.source.edition || "Unknown"} • ${scanData.source.organization?.isSandbox ? "Sandbox" : "Production"}`}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <KPI
                label="Apex Classes"
                value={scanData.inventory.code?.apexClasses?.length || 0}
                subtitle={`${scanData.inventory.code?.apexTriggers?.length || 0} triggers`}
              />
              <KPI
                label="Reports"
                value={scanData.inventory.reporting?.reports?.length || 0}
                subtitle={`${scanData.inventory.reporting?.dashboards?.length || 0} dashboards`}
              />
              <KPI
                label="Flows"
                value={scanData.inventory.automation?.flowSummary?.active ?? scanData.inventory.automation?.flows?.filter((f) => f.status === "Active").length ?? 0}
                subtitle={`Total: ${scanData.inventory.automation?.flowSummary?.total ?? scanData.inventory.automation?.flows?.length ?? 0}`}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
              />
              <KPI
                label="Triggers"
                value={scanData.inventory.automation?.triggers?.filter((t) => t.status === "Active").length || 0}
                subtitle={`Total: ${scanData.inventory.automation?.triggers?.length || 0}`}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
              <KPI
                label="Validation Rules"
                value={
                  Array.isArray(scanData.inventory.automation?.validationRules)
                    ? scanData.inventory.automation.validationRules.filter((vr) => vr.active).length
                    : (scanData.inventory.automation?.validationRules?.active ?? 0)
                }
                subtitle={`Total: ${
                  Array.isArray(scanData.inventory.automation?.validationRules)
                    ? scanData.inventory.automation.validationRules.length
                    : (scanData.inventory.automation?.validationRules?.total ?? 'n/a')
                }`}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>

            {scanData.health && (
              <div className="mb-6">
                <HealthCheckPanel health={scanData.health} scanId={scanData.scanId} scanData={scanData} />
              </div>
            )}

            <div className="mb-6">
              <AutomationSummary automation={scanData.inventory.automation} />
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

            {scanData.inventory.code && (
              <div className="mb-6">
                <CodeCoveragePanel code={scanData.inventory.code} />
              </div>
            )}

            <div className="mb-6">
              <ObjectsTable 
                objects={scanData.inventory.sourceObjects} 
                automation={scanData.inventory.automation}
                code={scanData.inventory.code}
              />
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

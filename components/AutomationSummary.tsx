"use client";

import { AutomationIndex } from "@/lib/types";
import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";

interface AutomationSummaryProps {
  automation: AutomationIndex;
}

export default function AutomationSummary({ automation }: AutomationSummaryProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "flows" | "triggers" | "validation">("overview");

  // Flow analysis
  const flowsByProcessType = automation.flows.reduce((acc, flow) => {
    const type = flow.processType || "Unknown";
    if (!acc[type]) acc[type] = [];
    acc[type].push(flow);
    return acc;
  }, {} as Record<string, typeof automation.flows>);

  const recordTriggeredFlows = automation.flows.filter(f => f.processType === "RecordTriggeredFlow" || f.triggerType);
  const flowsByObject = recordTriggeredFlows.reduce((acc, flow) => {
    const obj = flow.object || "Unknown";
    if (!acc[obj]) acc[obj] = [];
    acc[obj].push(flow);
    return acc;
  }, {} as Record<string, typeof automation.flows>);

  // Trigger analysis
  const triggersByObject = automation.triggers.reduce((acc, trigger) => {
    const obj = trigger.tableEnumOrId || "Unknown";
    if (!acc[obj]) acc[obj] = [];
    acc[obj].push(trigger);
    return acc;
  }, {} as Record<string, typeof automation.triggers>);

  // Validation Rule analysis - handle both array and AutomationCount types
  const validationRulesArray = Array.isArray(automation.validationRules) 
    ? automation.validationRules 
    : [];
  const vrsByObject = validationRulesArray.reduce((acc, vr) => {
    // Extract object from fullName (format: ObjectName.RuleName)
    const obj = vr.fullName.split(".")[0] || "Unknown";
    if (!acc[obj]) acc[obj] = [];
    acc[obj].push(vr);
    return acc;
  }, {} as Record<string, typeof validationRulesArray>);
  
  const validationRulesCount = Array.isArray(automation.validationRules)
    ? automation.validationRules.length
    : (automation.validationRules?.total ?? 0);
  const validationRulesActive = Array.isArray(automation.validationRules)
    ? automation.validationRules.filter(vr => vr.active).length
    : (automation.validationRules?.active ?? 0);
  
  const workflowRulesCount = Array.isArray(automation.workflowRules)
    ? automation.workflowRules.length
    : (automation.workflowRules?.total ?? 0);
  const workflowRulesActive = Array.isArray(automation.workflowRules)
    ? automation.workflowRules.filter(wr => wr.active).length
    : (automation.workflowRules?.active ?? null);
  
  const approvalProcessesCount = Array.isArray(automation.approvalProcesses)
    ? automation.approvalProcesses.length
    : (automation.approvalProcesses?.total ?? 0);
  const approvalProcessesActive = Array.isArray(automation.approvalProcesses)
    ? automation.approvalProcesses.filter(ap => ap.active).length
    : (automation.approvalProcesses?.active ?? null);

  return (
    <CollapsibleSection title="Automation Posture" defaultOpen={true}>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Summary Cards */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Total Flows</div>
              <div className="text-2xl font-bold text-blue-900">{automation.flows.length}</div>
              <div className="text-xs text-gray-500 mt-1">
                {automation.flows.filter(f => f.status === "Active").length} active
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Triggers</div>
              <div className="text-2xl font-bold text-purple-900">{automation.triggers.length}</div>
              <div className="text-xs text-gray-500 mt-1">
                {automation.triggers.filter(t => t.status === "Active").length} active
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Validation Rules</div>
              <div className="text-2xl font-bold text-orange-900">{validationRulesCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {validationRulesActive !== null ? `${validationRulesActive} active` : 'n/a'}
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Workflow Rules</div>
              <div className="text-2xl font-bold text-gray-900">{workflowRulesCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {workflowRulesActive !== null ? `${workflowRulesActive} active` : 'n/a'}
              </div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Approval Processes</div>
              <div className="text-2xl font-bold text-green-900">{approvalProcessesCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {approvalProcessesActive !== null ? `${approvalProcessesActive} active` : 'n/a'}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex space-x-1 px-6">
            {[
              { id: "overview", label: "Overview" },
              { id: "flows", label: `Flows (${automation.flows.length})` },
              { id: "triggers", label: `Triggers (${automation.triggers.length})` },
              { id: "validation", label: `VRs (${validationRulesCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Flows by ProcessType */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Flows by Process Type</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(flowsByProcessType).map(([type, flows]) => (
                    <div key={type} className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-600">{type}</div>
                      <div className="text-lg font-bold">{flows.length}</div>
                      <div className="text-xs text-gray-500">
                        {flows.filter(f => f.status === "Active").length} active
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Objects with Record-Triggered Flows */}
              {Object.keys(flowsByObject).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Record-Triggered Flows by Object</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(flowsByObject)
                      .sort(([, a], [, b]) => b.length - a.length)
                      .slice(0, 10)
                      .map(([obj, flows]) => (
                        <div key={obj} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{obj}</span>
                          <span className="text-gray-600">{flows.length} flow{flows.length !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Top Objects with Triggers */}
              {Object.keys(triggersByObject).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Triggers by Object</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(triggersByObject)
                      .sort(([, a], [, b]) => b.length - a.length)
                      .slice(0, 10)
                      .map(([obj, triggers]) => (
                        <div key={obj} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{obj}</span>
                          <span className="text-gray-600">{triggers.length} trigger{triggers.length !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Top Objects with Validation Rules */}
              {Object.keys(vrsByObject).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Validation Rules by Object</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(vrsByObject)
                      .sort(([, a], [, b]) => b.length - a.length)
                      .slice(0, 10)
                      .map(([obj, vrs]) => (
                        <div key={obj} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{obj}</span>
                          <span className="text-gray-600">{vrs.length} rule{vrs.length !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "flows" && (
            <div className="space-y-4">
              {Object.entries(flowsByProcessType).map(([type, flows]) => (
                <div key={type} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900">{type}</h4>
                    <span className="text-sm text-gray-600">{flows.length} flows</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {flows.map(flow => (
                      <div key={flow.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <div className="flex-1">
                          <div className="font-medium">{flow.masterLabel || flow.developerName}</div>
                          {flow.object && <div className="text-xs text-gray-500">Object: {flow.object}</div>}
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          flow.status === "Active" ? "bg-green-100 text-green-800" :
                          flow.status === "Draft" ? "bg-yellow-100 text-yellow-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {flow.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "triggers" && (
            <div className="space-y-4">
              {Object.entries(triggersByObject)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([obj, triggers]) => (
                  <div key={obj} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">{obj}</h4>
                      <span className="text-sm text-gray-600">{triggers.length} trigger{triggers.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {triggers.map(trigger => (
                        <div key={trigger.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium font-mono">{trigger.name}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            trigger.status === "Active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                          }`}>
                            {trigger.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === "validation" && (
            <div className="space-y-4">
              {Object.entries(vrsByObject)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([obj, vrs]) => (
                  <div key={obj} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">{obj}</h4>
                      <span className="text-sm text-gray-600">{vrs.length} rule{vrs.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {vrs.map(vr => (
                        <div key={vr.id} className="p-2 bg-gray-50 rounded text-sm">
                          <div className="font-medium">{vr.fullName.split(".")[1] || vr.fullName}</div>
                          {vr.errorMessage && (
                            <div className="text-xs text-gray-500 mt-1">{vr.errorMessage}</div>
                          )}
                          <span className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                            vr.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                          }`}>
                            {vr.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ))}
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


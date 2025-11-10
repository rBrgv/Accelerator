"use client";

import { ObjectStat, AutomationIndex, CodeIndex } from "@/lib/types";
import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";

interface ObjectsTableProps {
  objects: ObjectStat[];
  automation?: AutomationIndex;
  code?: CodeIndex;
}

export default function ObjectsTable({ objects, automation, code }: ObjectsTableProps) {
  const [sortField, setSortField] = useState<"name" | "recordCount">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeTab, setActiveTab] = useState<"withRecords" | "noRecords" | "withFlows" | "withTriggers" | "withVRs" | "apexClasses">("withRecords");

  // Build automation maps
  const objectsWithFlows = new Set<string>();
  const objectsWithTriggers = new Set<string>();
  const objectsWithVRs = new Set<string>();

  if (automation) {
    automation.flows.forEach(flow => {
      if (flow.object) objectsWithFlows.add(flow.object);
    });
    automation.triggers.forEach(trigger => {
      if (trigger.tableEnumOrId) objectsWithTriggers.add(trigger.tableEnumOrId);
    });
    const validationRulesArray = Array.isArray(automation.validationRules) 
      ? automation.validationRules 
      : [];
    validationRulesArray.forEach(vr => {
      const objName = vr.fullName.split(".")[0];
      if (objName) objectsWithVRs.add(objName);
    });
  }

  // Filter objects based on active tab
  const getFilteredObjects = () => {
    switch (activeTab) {
      case "withRecords":
        return objects.filter(obj => obj.recordCount !== undefined && obj.recordCount > 0);
      case "noRecords":
        return objects.filter(obj => obj.recordCount === undefined || obj.recordCount === 0);
      case "withFlows":
        return objects.filter(obj => objectsWithFlows.has(obj.name));
      case "withTriggers":
        return objects.filter(obj => objectsWithTriggers.has(obj.name));
      case "withVRs":
        return objects.filter(obj => objectsWithVRs.has(obj.name));
      case "apexClasses":
        return [];
      default:
        return objects;
    }
  };

  const filteredObjects = getFilteredObjects();
  const sortedObjects = [...filteredObjects].sort((a, b) => {
    let aVal: string | number = "";
    let bVal: string | number = "";

    if (sortField === "name") {
      aVal = a.label || a.name;
      bVal = b.label || b.name;
    } else {
      aVal = a.recordCount || 0;
      bVal = b.recordCount || 0;
    }

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: "name" | "recordCount") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Calculate totals across all objects (not filtered)
  const masterDetailCount = objects.reduce((sum, obj) => 
    sum + obj.lookups.filter(l => l.isMasterDetail).length, 0
  );
  const externalIdCount = objects.reduce((sum, obj) => 
    sum + obj.fields.filter(f => f.externalId === true).length, 0
  );

  const objectsWithRecords = objects.filter(obj => obj.recordCount !== undefined && obj.recordCount > 0).length;
  const objectsNoRecords = objects.filter(obj => obj.recordCount === undefined || obj.recordCount === 0).length;
  const flowsCount = objectsWithFlows.size;
  const triggersCount = objectsWithTriggers.size;
  const vrsCount = objectsWithVRs.size;
  const apexClassesCount = code?.apexClasses?.length ?? 0;

  return (
    <CollapsibleSection 
      title="Object Inventory & Health" 
      defaultOpen={true}
    >
      <div className="mb-4 flex gap-4 text-sm text-gray-600">
        <span>Total: {objects.length}</span>
        <span>Custom: {objects.filter(o => o.isCustom).length}</span>
        <span>M-D: {masterDetailCount}</span>
        <span>Ext ID: {externalIdCount}</span>
      </div>
      
      {/* Tabs */}
      <div className="flex space-x-1 border-b mb-4">
          {[
            { id: "withRecords" as const, label: `With Records (${objectsWithRecords})` },
            { id: "noRecords" as const, label: `No Records (${objectsNoRecords})` },
            { id: "withFlows" as const, label: `With Flows (${flowsCount})` },
            { id: "withTriggers" as const, label: `With Triggers (${triggersCount})` },
            { id: "withVRs" as const, label: `With VRs (${vrsCount})` },
            ...(apexClassesCount > 0 ? [{ id: "apexClasses" as const, label: `Apex Classes (${apexClassesCount})` }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("name")}
              >
                Object {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => activeTab !== "apexClasses" && handleSort("recordCount")}
              >
                {activeTab === "apexClasses" ? "Coverage" : `Records ${sortField === "recordCount" && (sortDirection === "asc" ? "↑" : "↓")}`}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Related</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Badges</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {activeTab === "apexClasses" && code?.apexClasses ? (
              code.apexClasses.length > 0 ? (
                [...code.apexClasses]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((cls) => {
                    // Find coverage data for this class
                    const coverage = code?.coverage?.byClass?.find((c: { id: string }) => c.id === cls.id);
                    const coveragePercent = coverage?.percent;
                    
                    return (
                      <tr key={cls.id} className="hover:bg-blue-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{cls.name}</div>
                          <div className="text-xs text-gray-500 font-mono">{cls.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">Apex Class</span>
                        </td>
                        <td className="px-4 py-3">
                          {coverage && coveragePercent !== undefined ? (
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                coveragePercent >= 75 ? "bg-green-100 text-green-800" :
                                coveragePercent >= 50 ? "bg-yellow-100 text-yellow-800" :
                                "bg-red-100 text-red-800"
                              }`}>
                                {coveragePercent}%
                              </span>
                              <span className="text-xs text-gray-500">
                                ({coverage.numLinesCovered.toLocaleString()}/{coverage.numLinesCovered + coverage.numLinesUncovered})
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No coverage data</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">API Version: {cls.apiVersion}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Code</span>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No Apex classes found</td></tr>
              )
            ) : sortedObjects.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm font-medium">No objects found in this view</p>
                    <p className="text-xs mt-1">Try selecting a different tab</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedObjects.map((obj) => {
              const objMasterDetailCount = obj.lookups.filter(l => l.isMasterDetail).length;
              const objExternalIdCount = obj.fields.filter(f => f.externalId === true).length;
              const requiredFieldsNoDefault = obj.fields.filter(f => f.required && !f.nillable).length;
              const longTextFields = obj.fields.filter(f => (f.type === "textarea" || f.type === "richtextarea") && f.length && f.length > 255).length;
              return (
                <tr key={obj.name} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{obj.label || obj.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{obj.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      obj.isCustom 
                        ? "bg-purple-100 text-purple-800" 
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {obj.isCustom ? "Custom" : "Standard"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {obj.recordCount !== undefined ? obj.recordCount.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="space-y-1">
                      <div>Fields: {obj.fields.length}</div>
                      <div>RecordTypes: {obj.recordTypes.length}</div>
                      <div>Picklists: {obj.picklists.length}</div>
                      {objMasterDetailCount > 0 && <div className="text-orange-600">M-D: {objMasterDetailCount}</div>}
                      {objExternalIdCount > 0 && <div className="text-blue-600">Ext ID: {objExternalIdCount}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {obj.autonumberFields.length > 0 && (
                        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full font-medium" title="Autonumber field present">
                          Auto#
                        </span>
                      )}
                      {obj.recordCount && obj.recordCount >= 1000000 && (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full font-medium" title="≥1M records">
                          ≥1M
                        </span>
                      )}
                      {obj.recordCount && obj.recordCount >= 100000 && obj.recordCount < 1000000 && (
                        <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full font-medium" title="≥100k records">
                          Large
                        </span>
                      )}
                      {objMasterDetailCount > 0 && (
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full font-medium" title="Master-Detail relationships">
                          M-D
                        </span>
                      )}
                      {objExternalIdCount > 0 && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-medium" title="External ID fields">
                          Ext ID
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}


"use client";

import { SecurityIndex } from "@/lib/types";
import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection";

interface SecuritySummaryProps {
  security?: SecurityIndex;
}

export default function SecuritySummary({ security }: SecuritySummaryProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "licenses" | "profiles" | "permissions">("overview");

  if (!security) return null;

  // Group profiles by license
  const profilesByLicense = security.profiles.reduce((acc, profile) => {
    const license = profile.userLicense || "Unknown";
    if (!acc[license]) acc[license] = [];
    acc[license].push(profile);
    return acc;
  }, {} as Record<string, typeof security.profiles>);

  // Group permission sets by license
  const permSetsByLicense = security.permissionSets.reduce((acc, ps) => {
    const license = ps.userLicense || "Unknown";
    if (!acc[license]) acc[license] = [];
    acc[license].push(ps);
    return acc;
  }, {} as Record<string, typeof security.permissionSets>);

  // Calculate license usage percentage
  const getUsagePercentage = (used: number, total: number) => {
    if (!total) return 0;
    return Math.min(100, Math.round((used / total) * 100));
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-orange-500";
    if (percentage >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <CollapsibleSection title="Security & Access" defaultOpen={false}>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Summary Cards */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Profiles</div>
              <div className="text-2xl font-bold text-blue-900">{security.totalProfiles}</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Permission Sets</div>
              <div className="text-2xl font-bold text-purple-900">{security.totalPermissionSets}</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">Active Users</div>
              <div className="text-2xl font-bold text-green-900">{security.totalUsers.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">From license usage</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <div className="text-xs text-gray-600 uppercase">License Types</div>
              <div className="text-2xl font-bold text-orange-900">{Object.keys(security.licenseDistribution).length}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex space-x-1 px-6">
            {[
              { id: "overview", label: "Overview" },
              { id: "licenses", label: `Licenses (${Object.keys(security.licenseDistribution).length})` },
              { id: "profiles", label: `Profiles (${security.totalProfiles})` },
              { id: "permissions", label: `Permission Sets (${security.totalPermissionSets})` },
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
              {/* License Summary */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">License Usage Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(security.licenseDistribution)
                    .sort(([, a], [, b]) => b.used - a.used)
                    .slice(0, 6)
                    .map(([license, info]) => {
                      const percentage = getUsagePercentage(info.used, info.total);
                      return (
                        <div key={license} className="p-3 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900">{license}</span>
                            <span className="text-xs text-gray-600">{percentage}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div
                              className={`h-2 rounded-full ${getUsageColor(percentage)}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {info.used.toLocaleString()} / {info.total.toLocaleString()} used
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs text-gray-600">Profiles by License</div>
                  <div className="text-lg font-bold text-blue-900">{Object.keys(profilesByLicense).length}</div>
                  <div className="text-xs text-gray-500">License types</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-xs text-gray-600">Permission Sets by License</div>
                  <div className="text-lg font-bold text-purple-900">{Object.keys(permSetsByLicense).length}</div>
                  <div className="text-xs text-gray-500">License types</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-xs text-gray-600">Total Licenses Used</div>
                  <div className="text-lg font-bold text-green-900">
                    {Object.values(security.licenseDistribution).reduce((sum, info) => sum + info.used, 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Across all types</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "licenses" && (
            <div className="space-y-4">
              {Object.entries(security.licenseDistribution)
                .sort(([, a], [, b]) => b.used - a.used)
                .map(([license, info]) => {
                  const percentage = getUsagePercentage(info.used, info.total);
                  return (
                    <div key={license} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{license}</h4>
                        <span className={`px-3 py-1 text-sm rounded-full ${
                          percentage >= 90 ? "bg-red-100 text-red-800" :
                          percentage >= 75 ? "bg-orange-100 text-orange-800" :
                          percentage >= 50 ? "bg-yellow-100 text-yellow-800" :
                          "bg-green-100 text-green-800"
                        }`}>
                          {percentage}% used
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                        <div
                          className={`h-3 rounded-full ${getUsageColor(percentage)}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-600">Used</div>
                          <div className="font-semibold text-gray-900">{info.used.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Available</div>
                          <div className="font-semibold text-gray-900">{info.available.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Total</div>
                          <div className="font-semibold text-gray-900">{info.total.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {activeTab === "profiles" && (
            <div className="space-y-4">
              {Object.entries(profilesByLicense)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([license, profiles]) => (
                  <div key={license} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">{license}</h4>
                      <span className="text-sm text-gray-600">{profiles.length} profile{profiles.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {profiles.map(profile => (
                        <div key={profile.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{profile.name}</span>
                          {profile.userCount > 0 && (
                            <span className="text-gray-600">{profile.userCount} user{profile.userCount !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === "permissions" && (
            <div className="space-y-4">
              {security.permissionSets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No permission sets found or unable to query permission sets.</p>
                  <p className="text-xs mt-2">Check server logs for details.</p>
                </div>
              ) : (
                Object.entries(permSetsByLicense)
                  .sort(([, a], [, b]) => b.length - a.length)
                  .map(([license, permSets]) => (
                    <div key={license} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{license}</h4>
                        <span className="text-sm text-gray-600">{permSets.length} permission set{permSets.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {permSets.map(ps => (
                          <div key={ps.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                            <div className="flex-1">
                              <div className="font-medium">{ps.label || ps.name}</div>
                              {ps.assignmentCount > 0 && (
                                <div className="text-xs text-gray-500 mt-1">{ps.assignmentCount} assignment{ps.assignmentCount !== 1 ? "s" : ""}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}


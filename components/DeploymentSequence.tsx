"use client";

import CollapsibleSection from "@/components/CollapsibleSection";

interface DeploymentPhase {
  no: number;
  name: string;
  note?: string;
}

const deploymentSequence: DeploymentPhase[] = [
  { no: 1, name: "Components" },
  { no: 2, name: "Public Groups" },
  { no: 3, name: "Global Value Sets" },
  { no: 4, name: "Standard Value Sets" },
  { no: 5, name: "Static Resources" },
  { no: 6, name: "Installed Packages" },
  { no: 7, name: "Profiles" },
  { no: 8, name: "Custom Settings & Custom Labels" },
  { no: 9, name: "Custom Objects (exclude formula fields)" },
  { no: 10, name: "Standard Object Custom Fields (exclude formula, lookup, roll-up)" },
  { no: 11, name: "Remaining Custom Fields (including formula, lookup, roll-up)" },
  { no: 12, name: "Managed Package Custom Fields" },
  { no: 13, name: "Custom Metadata Types" },
  { no: 14, name: "Custom Tabs (for custom objects)" },
  { no: 15, name: "Custom Permissions, Themes, and Branding assets" },
  { no: 16, name: "Core Standard Objects (Accounts, Contacts, Opportunities, etc.)" },
  { no: 17, name: "Roles, Queues, Sharing Rules, and Org-Wide Defaults" },
  { no: 18, name: "Additional Standard Objects (dependent relationships)" },
  { no: 19, name: "Letterheads & Documents" },
  { no: 20, name: "Email Templates & Content Assets" },
  { no: 21, name: "Matching Rules & Duplicate Rules" },
  { no: 22, name: "Deferred Custom Fields (if previously skipped due to org limits)" },
  { no: 23, name: "Dependent Email Templates (ApexComponent references)" },
  { no: 24, name: "Workflow Rules" },
  { no: 25, name: "Validation Rules" },
  { no: 26, name: "Knowledge Object setup" },
  { no: 27, name: "List Views (standard + custom)" },
  { no: 28, name: "Legacy Custom Fields (custom objects)" },
  { no: 29, name: "Workflow Email Alerts" },
  { no: 30, name: "Experience Cloud / Communities – Base Configuration" },
  { no: 31, name: "Flows & Process Builders" },
  { no: 32, name: "Page Layouts, Quick Actions, Web Links, Buttons" },
  { no: 33, name: "Flexipages, HomePage Layouts, Components, CustomPageWebLinks" },
  { no: 34, name: "Lead Conversion Settings, iFrame, and Whitelist Configurations" },
  { no: 35, name: "Report Types" },
  { no: 36, name: "Profile Object/Field Permissions, Tabs, Record Types, Custom Permissions" },
  { no: 37, name: "Profile Page Layout Assignments" },
  { no: 38, name: "Reports (defer until base objects deployed)", note: "Defer until base objects deployed" },
  { no: 39, name: "Experience Cloud / Communities – Advanced Configuration" },
  { no: 40, name: "Custom Tabs and Profile Permissions" },
  { no: 41, name: "Remaining Flexipages and Tab Assignments" },
  { no: 42, name: "Custom Applications and Search Customizations" },
  { no: 43, name: "Managed Package \"Legacy\" Field Additions" },
  { no: 44, name: "Standard Object \"Legacy\" Fields" },
  { no: 45, name: "Remaining \"Left-Out\" Legacy Fields" },
  { no: 46, name: "Permission Sets" },
  { no: 47, name: "Apex, Visualforce Pages, and Profile Permissions" },
  { no: 48, name: "Managed Package Object/Field Profile Permissions" },
  { no: 49, name: "Experience Cloud / Communities – Final Stage" },
  { no: 50, name: "Custom App bundles with assigned Profiles" },
  { no: 51, name: "Remote Site Settings and Connected Apps" },
  { no: 52, name: "Bug Fix / Configuration Adjustments (e.g., Connected App integrations)" },
  { no: 53, name: "Queues (final verification)" },
  { no: 54, name: "Reports & Dashboard Tab Permissions" },
  { no: 55, name: "Workflows (remaining)" },
  { no: 56, name: "Approval Processes" },
  { no: 57, name: "Email Template & Conga/Document Generation Dependencies" },
  { no: 58, name: "AutoNumber updates & legacy value text conversions" },
  { no: 59, name: "Final Bug Fix and Permission Polishing" },
  { no: 60, name: "Final Profile and PermissionSet Review" },
  { no: 61, name: "Criteria-Based Sharing Rules" },
  { no: 62, name: "Delta Changes (metadata differences post-migration)" },
  { no: 63, name: "External Objects and Data Sources" },
  { no: 64, name: "Auth Providers and Connection Settings" },
  { no: 65, name: "Reports (final deployment)" },
  { no: 66, name: "Dashboards" },
  { no: 67, name: "AutoNumber to Text Conversion (final sweep)" },
];

export default function DeploymentSequence() {
  return (
    <CollapsibleSection title="Recommended Metadata Deployment Sequence" defaultOpen={false}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            This is the recommended order for deploying metadata components. Follow this sequence to minimize dependency issues.
          </p>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {deploymentSequence.map((phase) => (
            <div
              key={phase.no}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                {phase.no}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{phase.name}</div>
                {phase.note && (
                  <div className="text-xs text-gray-500 mt-1">{phase.note}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}


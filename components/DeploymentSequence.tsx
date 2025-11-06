"use client";

import CollapsibleSection from "@/components/CollapsibleSection";

interface DeploymentPhase {
  no: number;
  name: string;
  note?: string;
}

const deploymentSequence: DeploymentPhase[] = [
  { no: 1, name: "Components" },
  { no: 2, name: "Groups" },
  { no: 3, name: "Global Value Sets" },
  { no: 4, name: "Standard Value Sets" },
  { no: 5, name: "Static Resource" },
  { no: 6, name: "Installed Packages" },
  { no: 7, name: "Profiles" },
  { no: 8, name: "Custom Setting & Custom Label" },
  { no: 9, name: "Custom Objects - Except formula fields" },
  { no: 10, name: "Standard Object - Custom Field - Exclude formula, lookup and rollup" },
  { no: 11, name: "Standard and Custom Object - Remaining custom fields (incl formula, lookup and rollup)" },
  { no: 12, name: "Managed Package Object - Xperi created fields" },
  { no: 13, name: "Custom Metadata Object - Custom metadata type" },
  { no: 14, name: "Custom tabs - Custom Objects" },
  { no: 15, name: "Custom Permission - PathAssist - Theme and Branding / Branding and theme" },
  { no: 16, name: "1st Set of Standard Objects" },
  { no: 17, name: "Roles, Queues, Sharing Rules & Sharing Settings" },
  { no: 18, name: "Standard Object - 2 split with Eshwar" },
  { no: 19, name: "Letterhead and Document" },
  { no: 20, name: "Email Template & Content Asset" },
  { no: 21, name: "Matching rule and duplicate rule" },
  { no: 22, name: "Custom Fields skipped because of limit issue" },
  { no: 23, name: "EmailTemplate - Skipped because of ApexComponent dependency" },
  { no: 24, name: "Workflow rules part 1" },
  { no: 25, name: "Validation rules" },
  { no: 26, name: "Knowledge object deployment" },
  { no: 27, name: "List Views Custom & Standard" },
  { no: 28, name: "Legacy Custom Fields on Custom Object" },
  { no: 29, name: "Workflow Email Alerts" },
  { no: 30, name: "Communities Part 1" },
  { no: 31, name: "Process Builders and Flows" },
  { no: 32, name: "PageLayouts - Quick Actions - Weblinks - buttons Standard & Custom Objects" },
  { no: 33, name: "Flexipages - HomepageLayout - HomePageComponent - CustomPageWebLink" },
  { no: 34, name: "LeadConvertSetting and IframeWhiteListUrlSettings" },
  { no: 35, name: "Report Types" },
  { no: 36, name: "Profile level permission for Std & Custom Object Field, custom perms, tabs, recType" },
  { no: 37, name: "Profile level page layout assignment record type wise" },
  { no: 38, name: "Reports - NOT DEPLOYED AT THIS NO", note: "Skipped for now" },
  { no: 39, name: "Communities Part 2" },
  { no: 40, name: "Custom Tabs and Profile Permission Deploy" },
  { no: 41, name: "Remaining Flexipage its Tab and profile - incomplete commented dashboards pass 1" },
  { no: 42, name: "Custom Applications and Search customizations" },
  { no: 43, name: "Managed Package Legacy Custom fields addition" },
  { no: 44, name: "Standard Objects Legacy Fields Deployment" },
  { no: 45, name: "Left Out Legacy Fields Deployment" },
  { no: 46, name: "Permission Sets Part 1" },
  { no: 47, name: "Apex Flows, VFPages, Profile permissions" },
  { no: 48, name: "Managed Package Objects and Fields Profile permissions" },
  { no: 49, name: "Communities Part 3" },
  { no: 50, name: "Certification Console custom app with profile" },
  { no: 51, name: "Remote Site Settings and Other related Components" },
  { no: 52, name: "Bug Fix - 1 & Paradot package installation" },
  { no: 53, name: "Bug Fix - 2" },
  { no: 54, name: "Bug fix - HomePageLegalFlexipage" },
  { no: 55, name: "Queues" },
  { no: 56, name: "Reports & Dashboards Tab permissions" },
  { no: 57, name: "Workflows without case and contract request" },
  { no: 58, name: "Workflow - Case & Contract request - 1" },
  { no: 59, name: "Approval Process - 1" },
  { no: 60, name: "Workflow - Case & Contract request - 2 & Conga email temps (Complete)" },
  { no: 61, name: "Apex Class & Triggers related to CG" },
  { no: 62, name: "Process Builders - Flows - part 2" },
  { no: 63, name: "Autonumber fields update on Email templates" },
  { no: 64, name: "AutoNumber Update - Email Template CaseNumber ContractNumber with Legacy" },
  { no: 65, name: "Bug Fix - 3" },
  { no: 66, name: "Profile permissions - Final (Deploy at the end)" },
  { no: 67, name: "Custom App Profile Permission BugFix - 439" },
  { no: 68, name: "Link fields (autonumber formula)" },
  { no: 69, name: "Delta Changes - CriteriaSharingRule" },
  { no: 70, name: "Delta Changes Part - 1 (Eshwar)" },
  { no: 71, name: "Delta Changes - EmailTemplate" },
  { no: 72, name: "Delta Changes - Flows" },
  { no: 73, name: "Delta Changes Part - 2 (Eshwar)" },
  { no: 74, name: "Delta Report type" },
  { no: 75, name: "Report Folders with Permission - ReportFolderPermission1" },
  { no: 76, name: "Report Folders with Permission - ReportFolderPermission2" },
  { no: 77, name: "Delta Changes - Auth Provider" },
  { no: 78, name: "Delta Changes - External Object" },
  { no: 79, name: "Delta Changes - External Datasource" },
  { no: 80, name: "Delta Changes - Apex pages" },
  { no: 81, name: "Reports Deploy - Report Pass 1 AP" },
  { no: 82, name: "Reports Deploy - Report Pass 2 AP" },
  { no: 83, name: "Reports Deploy - Report Pass 3 AP" },
  { no: 84, name: "Reports Deploy - Report Pass 4 AP" },
  { no: 85, name: "Reports Deploy - Report Pass 5 MR" },
  { no: 86, name: "Reports Deploy - Report Pass 6 AP" },
  { no: 87, name: "Reports Deploy - Report Public Folder Pass 1" },
  { no: 88, name: "Delta Reports - Normal Folders Report Pass 1" },
  { no: 89, name: "Delta Reports - Normal Folders Report Pass 2" },
  { no: 90, name: "Delta Reports - Normal Folders Report retrieve" },
  { no: 91, name: "Delta Reports - Public" },
  { no: 92, name: "Dashboards (45, 46)" },
  { no: 93, name: "AutoNumber to text conversion" },
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


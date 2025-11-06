export interface Prerequisite {
  no: number;
  name: string;
  status: "Done" | "Pending" | "Not Started";
  note?: string;
}

// Migration Prerequisites - Pre-deployment checklist items
export const migrationPrerequisites: Prerequisite[] = [
  { no: 1, name: "Enable State and Country/Territory Picklists", status: "Not Started", note: "Manual pre-deploy step" },
  { no: 2, name: "Enable Multiple Currencies", status: "Not Started", note: "Manual pre-deploy step" },
  { no: 3, name: "Enable Digital Experiences", status: "Not Started" },
  { no: 4, name: "Enable Person Accounts", status: "Not Started", note: "If using Person Accounts" },
  { no: 5, name: "Enable Territory Management", status: "Not Started", note: "If using Territories" },
  { no: 6, name: "Enable Data.com", status: "Not Started", note: "If using Data.com" },
  { no: 7, name: "Enable Knowledge", status: "Not Started", note: "If using Knowledge" },
  { no: 8, name: "Enable Live Agent", status: "Not Started", note: "If using Live Agent" },
  { no: 9, name: "Enable Service Cloud", status: "Not Started", note: "If using Service Cloud" },
  { no: 10, name: "Enable Marketing Cloud Connect", status: "Not Started", note: "If using Marketing Cloud" },
  { no: 11, name: "Enable Field Service", status: "Not Started", note: "If using Field Service" },
  { no: 12, name: "Enable CPQ", status: "Not Started", note: "If using CPQ" },
  { no: 13, name: "Enable Billing", status: "Not Started", note: "If using Billing" },
  { no: 14, name: "Enable Revenue Cloud", status: "Not Started", note: "If using Revenue Cloud" },
  { no: 15, name: "Enable Industries (Vlocity)", status: "Not Started", note: "If using Industries" },
  { no: 16, name: "Configure Sharing Settings", status: "Not Started", note: "Review and configure" },
  { no: 17, name: "Configure Data Classification", status: "Not Started", note: "Review data sensitivity" },
  { no: 18, name: "Configure Field-Level Security", status: "Not Started", note: "Review FLS settings" },
  { no: 19, name: "Configure Record Type Visibility", status: "Not Started", note: "Review record types" },
  { no: 20, name: "Configure Workflow Rules", status: "Not Started", note: "Review workflow rules" },
  { no: 21, name: "Configure Approval Processes", status: "Not Started", note: "Review approval processes" },
  { no: 22, name: "Configure Email Templates", status: "Not Started", note: "Review email templates" },
  { no: 23, name: "Configure Reports and Dashboards", status: "Not Started", note: "Review reports" },
  { no: 24, name: "Configure Custom Settings", status: "Not Started", note: "Review custom settings" },
  { no: 25, name: "Configure Custom Metadata", status: "Not Started", note: "Review custom metadata" },
  { no: 26, name: "Assign Files Connect Permission Set", status: "Not Started", note: "Assign before External Data Source deploy" },
];

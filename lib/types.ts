export type StorageUsage = {
  data: { usedMb: number; maxMb: number; remainingMb: number; usedPct: number };
  file: { usedMb: number; maxMb: number; remainingMb: number; usedPct: number };
  note?: string;
};

export interface OrgProfile {
  instanceUrl: string;
  apiVersion: string;
  orgId: string;
  edition?: string;
  organizationName?: string;
  dataSpaceUsed?: number; // in bytes
  dataSpaceTotal?: number; // in bytes
  fileSpaceUsed?: number; // in bytes
  fileSpaceTotal?: number; // in bytes
  storage?: StorageUsage;
  limits?: Record<string, any>;
  organization?: Record<string, any>;
  userLicenses?: Record<string, any>;
}

export interface FieldStat {
  name: string;
  type: string;
  label: string;
  required: boolean;
  unique: boolean;
  nillable: boolean;
  externalId?: boolean;
  length?: number;
}

export interface RecordType {
  id: string;
  name: string;
  developerName: string;
  active: boolean;
}

export interface Picklist {
  field: string;
  values: string[];
}

export interface Lookup {
  field: string;
  target: string;
  isMasterDetail?: boolean;
}

export interface AutonumberField {
  field: string;
  displayFormat?: string;
}

export interface ObjectStat {
  name: string;
  label: string;
  isCustom: boolean;
  recordCount?: number;
  fields: FieldStat[];
  recordTypes: RecordType[];
  picklists: Picklist[];
  lookups: Lookup[];
  autonumberFields: AutonumberField[];
}

export interface Flow {
  id: string;
  developerName: string;
  masterLabel: string;
  status: "Active" | "Draft" | "Obsolete" | "Inactive" | "InvalidDraft";
  apiVersion: string;
  processType?: string;
  triggerType?: string;
  object?: string;
}

export interface Trigger {
  id: string;
  name: string;
  tableEnumOrId: string;
  status: "Active" | "Inactive";
  apiVersion: string;
}

export interface ValidationRule {
  id: string;
  fullName: string;
  active: boolean;
  errorConditionFormula?: string;
  errorDisplayField?: string;
  errorMessage?: string;
}

export interface WorkflowRule {
  id: string;
  fullName: string;
  active: boolean;
}

export interface ApprovalProcess {
  id: string;
  fullName: string;
  active: boolean;
}

export interface AutomationCount {
  total: number | null;
  active: number | null;
  available: boolean;
  note?: string;
}

export interface AutomationIndex {
  flows: Flow[];
  triggers: Trigger[];
  validationRules: ValidationRule[] | AutomationCount;
  workflowRules?: WorkflowRule[] | AutomationCount;
  approvalProcesses?: ApprovalProcess[] | AutomationCount;
}

export interface CodeIndex {
  apexClasses: Array<{ id: string; name: string; apiVersion: string }>;
  apexTriggers: Array<{ id: string; name: string; apiVersion: string }>;
  coverage?: {
    orgWidePercent?: number | null;
    byClass: Array<{
      id: string;
      name: string;
      numLinesCovered: number;
      numLinesUncovered: number;
      percent?: number;
    }>;
    lastComputedAt?: string | null;
    note?: string;
  };
}

export interface ReportingIndex {
  reports: Array<{ id: string; name: string }>;
  dashboards: Array<{ id: string; name: string }>;
  emailTemplates: Array<{ id: string; name: string }>;
  reportTypes: Array<{ id: string; name: string }>;
}

export interface OwnershipIndex {
  users: Array<{ id: string; name: string; license: string; active: boolean }>;
  queues: Array<{ id: string; name: string }>;
}

export interface Finding {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  description: string;
  objects: string[];
  impact: string;
  remediation: string[];
}

export interface DependencyNode {
  name: string;
  label: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "lookup" | "master-detail";
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  order: string[];
}

export interface ScanSummary {
  objects: number;
  recordsApprox: number;
  flows: number;
  triggers: number;
  vrs: number;
  findingsHigh: number;
  findingsMedium: number;
  findingsLow: number;
  hash?: string;
  storage?: { dataUsedPct?: number; fileUsedPct?: number };
}

export interface SecurityIndex {
  profiles: Array<{ id: string; name: string; userLicense: string; userCount: number }>;
  permissionSets: Array<{ id: string; name: string; label: string; userLicense: string; assignmentCount: number }>;
  totalProfiles: number;
  totalPermissionSets: number;
  totalUsers: number;
  licenseDistribution: Record<string, { total: number; used: number; available: number }>;
}

export interface IntegrationIndex {
  connectedApps: Array<{ id: string; name: string; createdDate?: string }>;
  namedCredentials: Array<{ id: string; fullName: string; endpoint?: string }>;
  remoteSiteSettings: Array<{ id: string; fullName: string; url?: string }>;
  authProviders: Array<{ id: string; fullName: string; providerType?: string }>;
}

export interface ScanOutput {
  source: OrgProfile;
  inventory: {
    sourceObjects: ObjectStat[];
    automation: AutomationIndex;
    code: CodeIndex;
    reporting: ReportingIndex;
    ownership: OwnershipIndex;
    packages: Array<{ namespace: string; name: string }>;
    security?: SecurityIndex;
    integrations?: IntegrationIndex;
  };
  findings: Finding[];
  dependencyGraph: DependencyGraph;
  summary: ScanSummary;
  scanId?: string;
  scanDuration?: number;
  scanDurationSeconds?: number;
}

export interface ScanRun {
  id: string;
  orgConnectionId: string;
  scanOutput: ScanOutput;
  createdAt: Date;
}


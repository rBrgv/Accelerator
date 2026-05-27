import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { runScan } from "@/server/composeScan";
import { ensureOrgConnection, saveScan } from "@/server/persistence";
import { createLogger } from "@/server/logger";
import type { ScanOutput } from "@/lib/types";

const DEMO_SCAN_OUTPUT: ScanOutput & { scanDuration: number; scanDurationSeconds: number } = {
  scanDuration: 18_420,
  scanDurationSeconds: 18.4,
  source: {
    instanceUrl: "https://acmecorp.my.salesforce.com",
    apiVersion: "v60.0",
    orgId: "00D3h000004FakeX",
    edition: "Enterprise",
    organizationName: "Acme Corp (Demo)",
    dataSpaceUsed: 2_684_354_560,
    dataSpaceTotal: 10_737_418_240,
    fileSpaceUsed: 1_610_612_736,
    fileSpaceTotal: 10_737_418_240,
    storage: {
      data: { usedMb: 2560, maxMb: 10240, remainingMb: 7680, usedPct: 25 },
      file: { usedMb: 1536, maxMb: 10240, remainingMb: 8704, usedPct: 15 },
    },
    limits: {
      DailyApiRequests: { Remaining: 4_850_000, Max: 5_000_000 },
      DailyBulkApiRequests: { Remaining: 9_940, Max: 10_000 },
      ActiveScratchOrgs: { Remaining: 40, Max: 40 },
      ConcurrentAsyncGetReportInstances: { Remaining: 200, Max: 200 },
    },
  },
  inventory: {
    sourceObjects: [
      { name: "Account", label: "Account", isCustom: false, recordCount: 142_830, fields: [{ name: "AnnualRevenue", type: "currency", label: "Annual Revenue", required: false, unique: false, nillable: true }, { name: "Industry", type: "picklist", label: "Industry", required: false, unique: false, nillable: true }], recordTypes: [{ id: "012000000000001", name: "Corporate", developerName: "Corporate", active: true }, { id: "012000000000002", name: "SMB", developerName: "SMB", active: true }], picklists: [{ field: "Industry", values: ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail"] }, { field: "Rating", values: ["Hot", "Warm", "Cold"] }], lookups: [], autonumberFields: [] },
      { name: "Contact", label: "Contact", isCustom: false, recordCount: 389_174, fields: [{ name: "Title", type: "string", label: "Title", required: false, unique: false, nillable: true }], recordTypes: [], picklists: [{ field: "LeadSource", values: ["Web", "Phone Inquiry", "Partner Referral", "Purchased List", "Other"] }], lookups: [{ field: "AccountId", target: "Account", isMasterDetail: false }], autonumberFields: [] },
      { name: "Opportunity", label: "Opportunity", isCustom: false, recordCount: 67_412, fields: [{ name: "Amount", type: "currency", label: "Amount", required: false, unique: false, nillable: true }, { name: "CloseDate", type: "date", label: "Close Date", required: true, unique: false, nillable: false }], recordTypes: [{ id: "012000000000003", name: "New_Business", developerName: "New_Business", active: true }, { id: "012000000000004", name: "Renewal", developerName: "Renewal", active: true }, { id: "012000000000005", name: "Upsell", developerName: "Upsell", active: true }], picklists: [{ field: "StageName", values: ["Prospecting", "Qualification", "Needs Analysis", "Value Proposition", "Id. Decision Makers", "Perception Analysis", "Proposal/Price Quote", "Negotiation/Review", "Closed Won", "Closed Lost"] }], lookups: [{ field: "AccountId", target: "Account", isMasterDetail: false }], autonumberFields: [] },
      { name: "Lead", label: "Lead", isCustom: false, recordCount: 231_087, fields: [], recordTypes: [], picklists: [{ field: "Status", values: ["Open - Not Contacted", "Working - Contacted", "Closed - Converted", "Closed - Not Converted"] }], lookups: [], autonumberFields: [] },
      { name: "Case", label: "Case", isCustom: false, recordCount: 98_553, fields: [], recordTypes: [{ id: "012000000000006", name: "Product_Support", developerName: "Product_Support", active: true }, { id: "012000000000007", name: "Billing_Inquiry", developerName: "Billing_Inquiry", active: true }], picklists: [{ field: "Status", values: ["New", "Working", "Escalated", "Closed"] }, { field: "Priority", values: ["High", "Medium", "Low"] }], lookups: [{ field: "AccountId", target: "Account", isMasterDetail: false }, { field: "ContactId", target: "Contact", isMasterDetail: false }], autonumberFields: [] },
      { name: "Revenue__c", label: "Revenue", isCustom: true, recordCount: 54_210, fields: [{ name: "Amount__c", type: "currency", label: "Amount", required: true, unique: false, nillable: false }, { name: "Recognized_Date__c", type: "date", label: "Recognized Date", required: true, unique: false, nillable: false }, { name: "Status__c", type: "picklist", label: "Status", required: false, unique: false, nillable: true }], recordTypes: [], picklists: [{ field: "Status__c", values: ["Pending", "Recognized", "Deferred", "Reversed"] }], lookups: [{ field: "Opportunity__c", target: "Opportunity", isMasterDetail: true }], autonumberFields: [{ field: "Revenue_Number__c", displayFormat: "REV-{0000000}" }] },
      { name: "Project__c", label: "Project", isCustom: true, recordCount: 12_874, fields: [{ name: "Start_Date__c", type: "date", label: "Start Date", required: true, unique: false, nillable: false }, { name: "End_Date__c", type: "date", label: "End Date", required: false, unique: false, nillable: true }, { name: "Health_Status__c", type: "picklist", label: "Health Status", required: false, unique: false, nillable: true }], recordTypes: [{ id: "012000000000008", name: "Implementation", developerName: "Implementation", active: true }, { id: "012000000000009", name: "Consulting", developerName: "Consulting", active: true }], picklists: [{ field: "Health_Status__c", values: ["Green", "Yellow", "Red"] }], lookups: [{ field: "Account__c", target: "Account", isMasterDetail: false }, { field: "Opportunity__c", target: "Opportunity", isMasterDetail: false }], autonumberFields: [{ field: "Project_Number__c", displayFormat: "PRJ-{00000}" }] },
      { name: "Project_Task__c", label: "Project Task", isCustom: true, recordCount: 87_342, fields: [{ name: "Completion_Pct__c", type: "percent", label: "Completion %", required: false, unique: false, nillable: true }], recordTypes: [], picklists: [{ field: "Status__c", values: ["Not Started", "In Progress", "Completed", "Blocked"] }], lookups: [{ field: "Project__c", target: "Project__c", isMasterDetail: true }], autonumberFields: [] },
      { name: "Contract_Line_Item__c", label: "Contract Line Item", isCustom: true, recordCount: 203_516, fields: [{ name: "Unit_Price__c", type: "currency", label: "Unit Price", required: true, unique: false, nillable: false }, { name: "Quantity__c", type: "double", label: "Quantity", required: true, unique: false, nillable: false }], recordTypes: [], picklists: [], lookups: [{ field: "Contract__c", target: "Contract", isMasterDetail: true }], autonumberFields: [] },
      { name: "Partner_Account__c", label: "Partner Account", isCustom: true, recordCount: 3_291, fields: [{ name: "Partner_Tier__c", type: "picklist", label: "Partner Tier", required: false, unique: false, nillable: true }, { name: "Certification_Level__c", type: "picklist", label: "Certification Level", required: false, unique: false, nillable: true }], recordTypes: [], picklists: [{ field: "Partner_Tier__c", values: ["Gold", "Silver", "Bronze"] }], lookups: [{ field: "Account__c", target: "Account", isMasterDetail: false }], autonumberFields: [] },
      { name: "Invoice__c", label: "Invoice", isCustom: true, recordCount: 39_847, fields: [{ name: "Invoice_Date__c", type: "date", label: "Invoice Date", required: true, unique: false, nillable: false }, { name: "Due_Date__c", type: "date", label: "Due Date", required: true, unique: false, nillable: false }, { name: "Total_Amount__c", type: "currency", label: "Total Amount", required: false, unique: false, nillable: true }], recordTypes: [], picklists: [{ field: "Payment_Status__c", values: ["Unpaid", "Partial", "Paid", "Overdue", "Void"] }], lookups: [{ field: "Account__c", target: "Account", isMasterDetail: false }], autonumberFields: [{ field: "Invoice_Number__c", displayFormat: "INV-{0000000}" }] },
      { name: "SLA__c", label: "SLA", isCustom: true, recordCount: 1_204, fields: [], recordTypes: [], picklists: [{ field: "Tier__c", values: ["Platinum", "Gold", "Standard"] }], lookups: [{ field: "Account__c", target: "Account", isMasterDetail: false }], autonumberFields: [] },
    ],
    automation: {
      flows: [
        { id: "301000000000001", developerName: "Lead_Assignment_Flow", masterLabel: "Lead Assignment Flow", status: "Active", apiVersion: "58.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Lead" },
        { id: "301000000000002", developerName: "Opportunity_Stage_Notifications", masterLabel: "Opportunity Stage Notifications", status: "Active", apiVersion: "59.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Opportunity" },
        { id: "301000000000003", developerName: "Case_Auto_Assignment", masterLabel: "Case Auto-Assignment", status: "Active", apiVersion: "59.0", processType: "AutoLaunchedFlow", triggerType: "RecordBeforeSave", object: "Case" },
        { id: "301000000000004", developerName: "Account_Scoring_Flow", masterLabel: "Account Scoring Flow", status: "Active", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Account" },
        { id: "301000000000005", developerName: "Revenue_Recognition_Flow", masterLabel: "Revenue Recognition Flow", status: "Active", apiVersion: "58.0", processType: "AutoLaunchedFlow", triggerType: "Scheduled", object: "Revenue__c" },
        { id: "301000000000006", developerName: "Project_Health_Rollup", masterLabel: "Project Health Rollup", status: "Active", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Project_Task__c" },
        { id: "301000000000007", developerName: "SLA_Breach_Alert", masterLabel: "SLA Breach Alert", status: "Active", apiVersion: "59.0", processType: "AutoLaunchedFlow", triggerType: "Scheduled", object: "Case" },
        { id: "301000000000008", developerName: "Partner_Tier_Update", masterLabel: "Partner Tier Update", status: "Active", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: "RecordBeforeSave", object: "Partner_Account__c" },
        { id: "301000000000009", developerName: "Invoice_Overdue_Notification", masterLabel: "Invoice Overdue Notification", status: "Active", apiVersion: "58.0", processType: "AutoLaunchedFlow", triggerType: "Scheduled", object: "Invoice__c" },
        { id: "301000000000010", developerName: "Onboarding_Checklist_Flow", masterLabel: "Onboarding Checklist Flow", status: "Active", apiVersion: "60.0", processType: "Flow", triggerType: undefined, object: undefined },
        { id: "301000000000011", developerName: "Lead_Nurture_Sequence_v2", masterLabel: "Lead Nurture Sequence v2", status: "Active", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Lead" },
        { id: "301000000000012", developerName: "Lead_Nurture_Sequence_v1", masterLabel: "Lead Nurture Sequence v1 (Legacy)", status: "Inactive", apiVersion: "54.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Lead" },
        { id: "301000000000013", developerName: "Contract_Renewal_Reminder", masterLabel: "Contract Renewal Reminder", status: "Active", apiVersion: "59.0", processType: "AutoLaunchedFlow", triggerType: "Scheduled", object: "Contract" },
        { id: "301000000000014", developerName: "Opportunity_Win_Loss_Survey", masterLabel: "Opportunity Win/Loss Survey", status: "Active", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: "RecordAfterSave", object: "Opportunity" },
        { id: "301000000000015", developerName: "Data_Cleanup_Duplicates_Draft", masterLabel: "Data Cleanup – Duplicates (Draft)", status: "Draft", apiVersion: "60.0", processType: "AutoLaunchedFlow", triggerType: undefined, object: undefined },
      ],
      flowSummary: { total: 15, active: 13, available: true, method: "query" },
      triggers: [
        { id: "01q000000000001", name: "AccountTrigger", tableEnumOrId: "Account", status: "Active", apiVersion: "58.0" },
        { id: "01q000000000002", name: "OpportunityTrigger", tableEnumOrId: "Opportunity", status: "Active", apiVersion: "59.0" },
        { id: "01q000000000003", name: "CaseTrigger", tableEnumOrId: "Case", status: "Active", apiVersion: "57.0" },
        { id: "01q000000000004", name: "RevenueTrigger", tableEnumOrId: "Revenue__c", status: "Active", apiVersion: "58.0" },
        { id: "01q000000000005", name: "LeadTrigger", tableEnumOrId: "Lead", status: "Active", apiVersion: "59.0" },
        { id: "01q000000000006", name: "ProjectTrigger", tableEnumOrId: "Project__c", status: "Active", apiVersion: "60.0" },
        { id: "01q000000000007", name: "InvoiceTrigger", tableEnumOrId: "Invoice__c", status: "Active", apiVersion: "58.0" },
        { id: "01q000000000008", name: "ContactTrigger", tableEnumOrId: "Contact", status: "Inactive", apiVersion: "55.0" },
      ],
      validationRules: [
        { id: "03d000000000001", fullName: "Account.Annual_Revenue_Required_for_Enterprise", active: true, errorMessage: "Annual Revenue is required for Enterprise accounts." },
        { id: "03d000000000002", fullName: "Opportunity.Close_Date_Cannot_Be_Past", active: true, errorMessage: "Close Date cannot be set in the past for active opportunities." },
        { id: "03d000000000003", fullName: "Opportunity.Amount_Required_for_Closed_Won", active: true, errorMessage: "Amount is required when closing an opportunity as Won." },
        { id: "03d000000000004", fullName: "Case.Priority_Required_for_Escalated", active: true, errorMessage: "Priority must be set to High for escalated cases." },
        { id: "03d000000000005", fullName: "Revenue__c.Amount_Must_Be_Positive", active: true, errorMessage: "Revenue amount must be greater than zero." },
        { id: "03d000000000006", fullName: "Lead.Email_Format_Validation", active: true, errorMessage: "Please enter a valid email address." },
        { id: "03d000000000007", fullName: "Project__c.End_Date_After_Start_Date", active: true, errorMessage: "End Date must be after Start Date." },
        { id: "03d000000000008", fullName: "Invoice__c.Due_Date_After_Invoice_Date", active: true, errorMessage: "Due Date must be on or after Invoice Date." },
        { id: "03d000000000009", fullName: "Account.Website_Required_for_Named", active: false, errorMessage: "Website is required for Named accounts." },
        { id: "03d000000000010", fullName: "Opportunity.Discount_Approval_Required", active: true, errorMessage: "Opportunities with >20% discount require manager approval." },
        { id: "03d000000000011", fullName: "Contract_Line_Item__c.Quantity_Must_Be_Positive", active: true, errorMessage: "Quantity must be greater than zero." },
      ],
      workflowRules: [
        { id: "01Q000000000001", fullName: "Account.Field_Update_on_Rating_Change", active: true },
        { id: "01Q000000000002", fullName: "Opportunity.Email_Alert_on_Stage_Change", active: true },
        { id: "01Q000000000003", fullName: "Case.Escalation_Email_Alert", active: true },
        { id: "01Q000000000004", fullName: "Lead.Task_Create_on_New_Lead", active: true },
        { id: "01Q000000000005", fullName: "Opportunity.Field_Update_Probability", active: true },
        { id: "01Q000000000006", fullName: "Account.Legacy_Territory_Update", active: false },
        { id: "01Q000000000007", fullName: "Contact.Welcome_Email_on_Create", active: true },
      ],
      approvalProcesses: [
        { id: "04c000000000001", fullName: "Opportunity.Large_Deal_Approval", active: true },
        { id: "04c000000000002", fullName: "Invoice__c.Invoice_Approval_Process", active: true },
        { id: "04c000000000003", fullName: "Revenue__c.Revenue_Override_Approval", active: true },
      ],
    },
    code: {
      apexClasses: [
        { id: "01p000000000001", name: "AccountService", apiVersion: "60.0" },
        { id: "01p000000000002", name: "AccountServiceTest", apiVersion: "60.0" },
        { id: "01p000000000003", name: "OpportunityService", apiVersion: "59.0" },
        { id: "01p000000000004", name: "OpportunityServiceTest", apiVersion: "59.0" },
        { id: "01p000000000005", name: "CaseService", apiVersion: "58.0" },
        { id: "01p000000000006", name: "CaseServiceTest", apiVersion: "58.0" },
        { id: "01p000000000007", name: "LeadConversionHelper", apiVersion: "59.0" },
        { id: "01p000000000008", name: "LeadConversionHelperTest", apiVersion: "59.0" },
        { id: "01p000000000009", name: "RevenueCalculator", apiVersion: "60.0" },
        { id: "01p000000000010", name: "RevenueCalculatorTest", apiVersion: "60.0" },
        { id: "01p000000000011", name: "ProjectRollupService", apiVersion: "60.0" },
        { id: "01p000000000012", name: "ProjectRollupServiceTest", apiVersion: "60.0" },
        { id: "01p000000000013", name: "InvoiceGenerationService", apiVersion: "58.0" },
        { id: "01p000000000014", name: "InvoiceGenerationServiceTest", apiVersion: "58.0" },
        { id: "01p000000000015", name: "IntegrationCalloutHelper", apiVersion: "58.0" },
        { id: "01p000000000016", name: "IntegrationCalloutHelperTest", apiVersion: "58.0" },
        { id: "01p000000000017", name: "SLAEvaluationBatch", apiVersion: "59.0" },
        { id: "01p000000000018", name: "SLAEvaluationBatchTest", apiVersion: "59.0" },
        { id: "01p000000000019", name: "TerritoryAssignmentUtil", apiVersion: "55.0" },
        { id: "01p000000000020", name: "TerritoryAssignmentUtilTest", apiVersion: "55.0" },
        { id: "01p000000000021", name: "PartnerPortalController", apiVersion: "60.0" },
        { id: "01p000000000022", name: "PartnerPortalControllerTest", apiVersion: "60.0" },
        { id: "01p000000000023", name: "ContractRenewalScheduler", apiVersion: "59.0" },
        { id: "01p000000000024", name: "DataMigrationHelper", apiVersion: "57.0" },
        { id: "01p000000000025", name: "DataMigrationHelperTest", apiVersion: "57.0" },
        { id: "01p000000000026", name: "EmailNotificationService", apiVersion: "60.0" },
        { id: "01p000000000027", name: "EmailNotificationServiceTest", apiVersion: "60.0" },
        { id: "01p000000000028", name: "ReportingAggregationBatch", apiVersion: "58.0" },
        { id: "01p000000000029", name: "CurrencyConversionUtil", apiVersion: "60.0" },
        { id: "01p000000000030", name: "CurrencyConversionUtilTest", apiVersion: "60.0" },
      ],
      apexTriggers: [
        { id: "01p100000000001", name: "AccountTriggerHandler", apiVersion: "60.0" },
        { id: "01p100000000002", name: "OpportunityTriggerHandler", apiVersion: "59.0" },
        { id: "01p100000000003", name: "CaseTriggerHandler", apiVersion: "58.0" },
        { id: "01p100000000004", name: "RevenueTriggerHandler", apiVersion: "60.0" },
        { id: "01p100000000005", name: "ProjectTriggerHandler", apiVersion: "60.0" },
        { id: "01p100000000006", name: "InvoiceTriggerHandler", apiVersion: "58.0" },
        { id: "01p100000000007", name: "LeadTriggerHandler", apiVersion: "59.0" },
        { id: "01p100000000008", name: "ContactTriggerHandler", apiVersion: "55.0" },
      ],
      coverage: {
        orgWidePercent: 74,
        lastComputedAt: "2024-05-10T08:30:00.000Z",
        byClass: [
          { id: "01p000000000001", name: "AccountService", numLinesCovered: 187, numLinesUncovered: 23, percent: 89 },
          { id: "01p000000000003", name: "OpportunityService", numLinesCovered: 214, numLinesUncovered: 31, percent: 87 },
          { id: "01p000000000005", name: "CaseService", numLinesCovered: 156, numLinesUncovered: 44, percent: 78 },
          { id: "01p000000000009", name: "RevenueCalculator", numLinesCovered: 302, numLinesUncovered: 28, percent: 91 },
          { id: "01p000000000015", name: "IntegrationCalloutHelper", numLinesCovered: 89, numLinesUncovered: 67, percent: 57 },
          { id: "01p000000000017", name: "SLAEvaluationBatch", numLinesCovered: 134, numLinesUncovered: 86, percent: 61 },
          { id: "01p000000000019", name: "TerritoryAssignmentUtil", numLinesCovered: 45, numLinesUncovered: 78, percent: 37 },
          { id: "01p000000000021", name: "PartnerPortalController", numLinesCovered: 178, numLinesUncovered: 22, percent: 89 },
          { id: "01p000000000023", name: "ContractRenewalScheduler", numLinesCovered: 67, numLinesUncovered: 0, percent: 100 },
          { id: "01p000000000024", name: "DataMigrationHelper", numLinesCovered: 23, numLinesUncovered: 89, percent: 21 },
        ],
      },
    },
    reporting: {
      reports: Array.from({ length: 214 }, (_, i) => ({ id: `005r${String(i).padStart(12, "0")}`, name: ["Pipeline by Stage", "Monthly Revenue Trend", "Case Resolution Time", "Lead Conversion Rate", "Partner Performance", "Project Health Summary", "Invoice Aging Report", "Account Growth YoY", "Support Ticket Volume", "Opportunity Win/Loss Analysis"][i % 10] + (i >= 10 ? ` (${Math.floor(i / 10)})` : "") })),
      dashboards: Array.from({ length: 48 }, (_, i) => ({ id: `01Z${String(i).padStart(12, "0")}`, name: ["Sales Performance", "Customer Success", "Finance Overview", "Partner Scorecard", "Support Operations", "Executive Summary", "Marketing Pipeline", "Project Delivery"][i % 8] + (i >= 8 ? ` v${Math.floor(i / 8) + 1}` : "") })),
      emailTemplates: Array.from({ length: 67 }, (_, i) => ({ id: `00X${String(i).padStart(12, "0")}`, name: ["Welcome Email", "Renewal Reminder", "Invoice Notification", "Case Update", "Lead Follow-up", "Contract Expiry", "Project Kickoff", "SLA Breach Alert"][i % 8] + (i >= 8 ? ` (${Math.floor(i / 8)})` : "") })),
      reportTypes: Array.from({ length: 12 }, (_, i) => ({ id: `08p${String(i).padStart(12, "0")}`, name: ["Accounts with Opportunities", "Cases with Contacts", "Revenue with Opportunities", "Projects with Tasks", "Invoices with Accounts", "Partners with Accounts", "Leads with Campaigns", "Contacts with Activities", "Contracts with Line Items", "SLAs with Cases", "Users with Roles", "Opportunities with Products"][i] })),
    },
    ownership: {
      users: Array.from({ length: 187 }, (_, i) => ({
        id: `005${String(i).padStart(12, "0")}`,
        name: ["Alice Johnson", "Bob Martinez", "Carol White", "David Lee", "Emma Brown", "Frank Davis", "Grace Wilson", "Henry Taylor", "Isabella Moore", "James Anderson"][i % 10] + (i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ""),
        license: ["Salesforce", "Salesforce", "Salesforce", "Salesforce Platform", "Salesforce Platform", "Identity", "Chatter Free"][i % 7],
        active: i < 162,
      })),
      queues: [
        { id: "00G000000000001", name: "Enterprise Sales Queue" },
        { id: "00G000000000002", name: "SMB Sales Queue" },
        { id: "00G000000000003", name: "Tier 1 Support" },
        { id: "00G000000000004", name: "Tier 2 Support" },
        { id: "00G000000000005", name: "Escalations Queue" },
        { id: "00G000000000006", name: "Partner Success Queue" },
        { id: "00G000000000007", name: "Collections Queue" },
      ],
    },
    packages: [
      { namespace: "DemandTools", name: "DemandTools Data Quality" },
      { namespace: "Conga", name: "Conga Composer" },
      { namespace: "Docusign", name: "DocuSign eSignature" },
      { namespace: "Marketo", name: "Marketo Sales Insight" },
      { namespace: "Gainsight", name: "Gainsight CS" },
    ],
    security: {
      profiles: [
        { id: "00e000000000001", name: "System Administrator", userLicense: "Salesforce", userCount: 8 },
        { id: "00e000000000002", name: "Sales Rep", userLicense: "Salesforce", userCount: 62 },
        { id: "00e000000000003", name: "Sales Manager", userLicense: "Salesforce", userCount: 14 },
        { id: "00e000000000004", name: "Support Agent", userLicense: "Salesforce", userCount: 31 },
        { id: "00e000000000005", name: "Support Manager", userLicense: "Salesforce", userCount: 6 },
        { id: "00e000000000006", name: "Finance User", userLicense: "Salesforce Platform", userCount: 22 },
        { id: "00e000000000007", name: "Partner Community User", userLicense: "Partner Community", userCount: 44 },
      ],
      permissionSets: [
        { id: "0PS000000000001", name: "Revenue_Manager_PS", label: "Revenue Manager", userLicense: "Salesforce", assignmentCount: 18 },
        { id: "0PS000000000002", name: "API_Integration_PS", label: "API Integration Access", userLicense: "Salesforce", assignmentCount: 5 },
        { id: "0PS000000000003", name: "Data_Steward_PS", label: "Data Steward", userLicense: "Salesforce", assignmentCount: 12 },
        { id: "0PS000000000004", name: "Read_Only_Finance_PS", label: "Read-Only Finance", userLicense: "Salesforce Platform", assignmentCount: 9 },
      ],
      totalProfiles: 7,
      totalPermissionSets: 4,
      totalUsers: 187,
      licenseDistribution: {
        Salesforce: { total: 125, used: 111, available: 14 },
        "Salesforce Platform": { total: 50, used: 44, available: 6 },
        "Partner Community": { total: 75, used: 44, available: 31 },
        "Identity": { total: 25, used: 19, available: 6 },
      },
    },
    integrations: {
      connectedApps: [
        { id: "0H4000000000001", name: "Marketo Integration", createdDate: "2021-03-15T00:00:00.000Z" },
        { id: "0H4000000000002", name: "DocuSign eSign", createdDate: "2020-11-02T00:00:00.000Z" },
        { id: "0H4000000000003", name: "Gainsight CS", createdDate: "2022-01-20T00:00:00.000Z" },
        { id: "0H4000000000004", name: "Tableau CRM", createdDate: "2021-08-10T00:00:00.000Z" },
        { id: "0H4000000000005", name: "Slack Integration", createdDate: "2022-09-14T00:00:00.000Z" },
        { id: "0H4000000000006", name: "SAP ERP Connector", createdDate: "2019-06-01T00:00:00.000Z" },
      ],
      namedCredentials: [
        { id: "0XA000000000001", fullName: "SAP_ERP_Endpoint", endpoint: "https://sap-erp.acmecorp.internal/api/v2" },
        { id: "0XA000000000002", fullName: "Payment_Gateway_Prod", endpoint: "https://payments.acmecorp.com/api" },
        { id: "0XA000000000003", fullName: "Analytics_Warehouse", endpoint: "https://dwh.acmecorp.com/salesforce" },
      ],
      remoteSiteSettings: [
        { id: "0BT000000000001", fullName: "Marketo_API", url: "https://api.marketo.acmecorp.com" },
        { id: "0BT000000000002", fullName: "DocuSign_Production", url: "https://na3.docusign.net" },
        { id: "0BT000000000003", fullName: "SAP_ERP", url: "https://sap-erp.acmecorp.internal" },
        { id: "0BT000000000004", fullName: "Payment_Gateway", url: "https://payments.acmecorp.com" },
      ],
      authProviders: [
        { id: "0SO000000000001", fullName: "Google_SSO", providerType: "OpenIdConnect" },
        { id: "0SO000000000002", fullName: "Okta_SAML", providerType: "SAML" },
      ],
    },
  },
  findings: [
    {
      id: "f001",
      severity: "HIGH",
      category: "Automation",
      title: "Legacy Workflow Rules Must Be Migrated to Flow Before Retirement",
      description: "7 Workflow Rules are still active. Salesforce has announced Workflow Rules will be retired in a future release. These automations must be rebuilt in Flow before migration to avoid loss of business logic.",
      objects: ["Account", "Opportunity", "Case", "Lead", "Contact"],
      impact: "Active business processes will stop functioning after Workflow Rule retirement. Rebuilding post-migration is significantly harder due to data model differences.",
      remediation: [
        "Audit all 7 active Workflow Rules and document their trigger conditions and actions.",
        "Rebuild each as an equivalent Record-Triggered Flow or scheduled Flow.",
        "Deactivate legacy Workflow Rules after Flow go-live and validate in a sandbox.",
        "Ensure the replacement Flows are included in the migration runbook.",
      ],
    },
    {
      id: "f002",
      severity: "HIGH",
      category: "Code Quality",
      title: "Low Apex Test Coverage on Critical Classes (Below 75% Threshold)",
      description: "3 Apex classes — TerritoryAssignmentUtil (37%), DataMigrationHelper (21%), and IntegrationCalloutHelper (57%) — fall below Salesforce's minimum 75% coverage requirement. Deployments will fail in production.",
      objects: ["TerritoryAssignmentUtil", "DataMigrationHelper", "IntegrationCalloutHelper"],
      impact: "Production deployment of any metadata will be blocked until overall org coverage reaches 75%. These classes are the primary blockers.",
      remediation: [
        "Write unit tests for TerritoryAssignmentUtil covering territory assignment logic and edge cases.",
        "Add comprehensive tests for DataMigrationHelper — especially data transformation and error paths.",
        "Add mock callout tests for IntegrationCalloutHelper using HttpCalloutMock.",
        "Run Apex tests in a sandbox and confirm org-wide coverage exceeds 75% before scheduling migration deployment.",
      ],
    },
    {
      id: "f003",
      severity: "HIGH",
      category: "Data Volume",
      title: "High-Volume Objects May Exceed Limits During Initial Data Load",
      description: "Contact (389K), Contract Line Item (204K), Account (143K), and Lead (231K) have record volumes that will require Bulk API or staged loading during migration. Single-batch loads will hit governor limits.",
      objects: ["Contact", "Contract_Line_Item__c", "Account", "Lead"],
      impact: "Data load failures mid-migration can leave the target org in an inconsistent state, requiring rollback and replay.",
      remediation: [
        "Use Bulk API 2.0 for all objects exceeding 50,000 records.",
        "Load parent objects (Account) before child objects (Contact, Opportunity) to preserve relationship integrity.",
        "Stage the Contract Line Item load after Contract records are confirmed.",
        "Plan for a multi-hour load window and schedule during off-peak hours.",
      ],
    },
    {
      id: "f004",
      severity: "MEDIUM",
      category: "Automation",
      title: "Duplicate Trigger Coverage: Both Apex Triggers and Record-Triggered Flows on Same Objects",
      description: "Account, Opportunity, Case, and Lead each have both an Apex Trigger and one or more Record-Triggered Flows. Without explicit execution order control, race conditions and duplicate processing may occur.",
      objects: ["Account", "Opportunity", "Case", "Lead"],
      impact: "Unpredictable automation behavior: duplicate field updates, double notifications, or conflicting data writes, especially in high-concurrency scenarios.",
      remediation: [
        "Document the intended execution sequence for each object with both triggers and flows.",
        "Consider consolidating logic into Apex using the trigger-as-orchestrator pattern, or into Flow where possible.",
        "Add explicit order-of-execution guards (static flags or custom settings) to prevent re-entrant execution.",
        "Test all combinations in a full sandbox with concurrent DML operations.",
      ],
    },
    {
      id: "f005",
      severity: "MEDIUM",
      category: "Integration",
      title: "SAP ERP Connector Uses Internal Endpoint — Requires Updated Named Credential for Target Org",
      description: "The SAP ERP Named Credential points to an internal URL (sap-erp.acmecorp.internal). The target org will need a new Named Credential with the correct endpoint and credentials configured before go-live.",
      objects: ["SAP_ERP_Endpoint"],
      impact: "Any Apex callout or Flow action using this Named Credential will fail silently after migration if the credential is not updated.",
      remediation: [
        "Confirm the target org's network routing to the SAP ERP system.",
        "Recreate the Named Credential in the target org with updated endpoint and authentication settings.",
        "Update any hardcoded endpoint references in Apex to use Named Credentials.",
        "Test end-to-end integration in a staging environment before migration cutover.",
      ],
    },
    {
      id: "f006",
      severity: "MEDIUM",
      category: "Packages",
      title: "5 Managed Packages Require Re-installation and Reconfiguration in Target Org",
      description: "DemandTools, Conga Composer, DocuSign eSignature, Marketo Sales Insight, and Gainsight CS are installed managed packages. Each must be reinstalled and reconfigured in the target org independently.",
      objects: ["DemandTools", "Conga", "Docusign", "Marketo", "Gainsight"],
      impact: "Missing package reinstallation will break all features, reports, and automations that depend on package objects and fields.",
      remediation: [
        "Contact each vendor to obtain licenses and installation keys valid for the target org.",
        "Re-install each package in a sandbox environment and validate configuration.",
        "Rebuild any custom integrations that reference package APIs or custom objects.",
        "Ensure Gainsight CS data (health scores, timelines) migration plan is agreed with the vendor.",
      ],
    },
    {
      id: "f007",
      severity: "MEDIUM",
      category: "Data Quality",
      title: "Inactive Apex Trigger (ContactTrigger) Still Deployed — Indicates Unfinished Refactor",
      description: "ContactTrigger is deployed but marked Inactive (API version 55.0). This suggests an incomplete migration to Flow or a trigger refactor that was never finished. The inactive code adds maintenance risk.",
      objects: ["Contact"],
      impact: "If accidentally reactivated post-migration, old trigger logic will conflict with active Contact automation. Outdated API version also poses compatibility risk.",
      remediation: [
        "Review ContactTrigger code and determine if the logic has been replaced by the Contact Flow.",
        "If replaced, delete ContactTrigger and its handler class before migration.",
        "If still needed, update to current API version and ensure test coverage.",
      ],
    },
    {
      id: "f008",
      severity: "LOW",
      category: "Automation",
      title: "Draft Flow Not Removed: 'Data Cleanup – Duplicates' Left in Incomplete State",
      description: "A Flow named 'Data Cleanup – Duplicates (Draft)' is in Draft status. Incomplete flows deployed to production can be accidentally activated or cause confusion during migration metadata deployment.",
      objects: [],
      impact: "Low risk currently, but a Draft flow included in a deployment package can unexpectedly activate or overwrite an active flow with the same name.",
      remediation: [
        "Review the draft flow and determine if it is still needed.",
        "Either complete it and activate, or delete it to keep the automation inventory clean.",
      ],
    },
    {
      id: "f009",
      severity: "LOW",
      category: "Automation",
      title: "Legacy Flow Version Inactive but Not Deleted: 'Lead Nurture Sequence v1'",
      description: "Lead Nurture Sequence v1 is marked Inactive — superseded by v2 — but has not been deleted. Leaving obsolete flow versions in the org creates metadata clutter and potential deployment package conflicts.",
      objects: ["Lead"],
      impact: "Minimal runtime risk, but stale flows inflate metadata package size and can cause confusion during post-migration cleanup.",
      remediation: [
        "Confirm v2 is fully operational and v1 is no longer referenced anywhere.",
        "Delete the inactive v1 flow to keep the automation inventory clean before migration.",
      ],
    },
    {
      id: "f010",
      severity: "LOW",
      category: "Security",
      title: "API Integration Permission Set Has 5 Assignments — Review Before Migration",
      description: "The 'API Integration Access' Permission Set has 5 active assignments. These users will require reconfiguration in the target org, and integration credentials should be rotated post-migration.",
      objects: [],
      impact: "Integration users with stale credentials or overly broad permissions in the target org can introduce security risk.",
      remediation: [
        "Document all 5 API integration users and their integration use cases.",
        "Recreate integration users in the target org with least-privilege profiles.",
        "Rotate all API credentials (client IDs, secrets, tokens) after cutover.",
      ],
    },
  ],
  dependencyGraph: {
    nodes: [
      { name: "Account", label: "Account" },
      { name: "Contact", label: "Contact" },
      { name: "Opportunity", label: "Opportunity" },
      { name: "Lead", label: "Lead" },
      { name: "Case", label: "Case" },
      { name: "Revenue__c", label: "Revenue" },
      { name: "Project__c", label: "Project" },
      { name: "Project_Task__c", label: "Project Task" },
      { name: "Contract_Line_Item__c", label: "Contract Line Item" },
      { name: "Partner_Account__c", label: "Partner Account" },
      { name: "Invoice__c", label: "Invoice" },
      { name: "SLA__c", label: "SLA" },
    ],
    edges: [
      { from: "Contact", to: "Account", type: "lookup" },
      { from: "Opportunity", to: "Account", type: "lookup" },
      { from: "Case", to: "Account", type: "lookup" },
      { from: "Case", to: "Contact", type: "lookup" },
      { from: "Revenue__c", to: "Opportunity", type: "master-detail" },
      { from: "Project__c", to: "Account", type: "lookup" },
      { from: "Project__c", to: "Opportunity", type: "lookup" },
      { from: "Project_Task__c", to: "Project__c", type: "master-detail" },
      { from: "Contract_Line_Item__c", to: "Contract", type: "master-detail" },
      { from: "Partner_Account__c", to: "Account", type: "lookup" },
      { from: "Invoice__c", to: "Account", type: "lookup" },
      { from: "SLA__c", to: "Account", type: "lookup" },
    ],
    order: ["Account", "Contact", "Opportunity", "Lead", "Case", "Revenue__c", "Project__c", "Project_Task__c", "Contract_Line_Item__c", "Partner_Account__c", "Invoice__c", "SLA__c"],
  },
  summary: {
    objects: 12,
    recordsApprox: 1_331_340,
    flows: 13,
    triggers: 7,
    vrs: 10,
    findingsHigh: 3,
    findingsMedium: 4,
    findingsLow: 3,
    storage: { dataUsedPct: 25, fileUsedPct: 15 },
  },
  health: {
    overallScore: 68,
    categories: [
      {
        key: "governance",
        label: "Governance",
        score: 72,
        kpis: [
          { key: "record_types", label: "Record Type Usage", value: 9, status: "HEALTHY", detail: "9 record types across 4 objects — well-structured data segmentation." },
          { key: "packages", label: "Managed Package Sprawl", value: 5, status: "MONITOR", detail: "5 managed packages installed. Each requires re-installation in the target org." },
          { key: "profiles", label: "Profile Count", value: 7, status: "HEALTHY", detail: "7 profiles — lean and manageable." },
          { key: "perm_sets", label: "Permission Set Usage", value: 4, status: "HEALTHY", detail: "Permission sets in use for fine-grained access control." },
        ],
      },
      {
        key: "automation",
        label: "Automation",
        score: 61,
        kpis: [
          { key: "legacy_workflows", label: "Legacy Workflow Rules", value: 7, status: "RISK", detail: "7 Workflow Rules must be migrated to Flow before Salesforce retires them." },
          { key: "active_flows", label: "Active Flows", value: 13, status: "HEALTHY", detail: "13 active Record-Triggered and Scheduled Flows." },
          { key: "trigger_coverage", label: "Apex Trigger Overlaps", value: 4, status: "MONITOR", detail: "4 objects have both Apex Triggers and Record-Triggered Flows — review execution order." },
          { key: "inactive_triggers", label: "Inactive Apex Triggers", value: 1, status: "MONITOR", detail: "1 inactive Apex Trigger (ContactTrigger) — review before migration." },
        ],
      },
      {
        key: "data",
        label: "Data & Storage",
        score: 74,
        kpis: [
          { key: "data_storage", label: "Data Storage Usage", value: 25, status: "HEALTHY", detail: "25% data storage used (2.5 GB / 10 GB)." },
          { key: "file_storage", label: "File Storage Usage", value: 15, status: "HEALTHY", detail: "15% file storage used (1.5 GB / 10 GB)." },
          { key: "high_volume", label: "High-Volume Objects", value: 4, status: "MONITOR", detail: "4 objects exceed 100K records — Bulk API required for migration." },
          { key: "total_records", label: "Total Records", value: "1.3M", status: "MONITOR", detail: "~1.3M total records across all objects — plan a staged data migration." },
        ],
      },
      {
        key: "security",
        label: "Security",
        score: 78,
        kpis: [
          { key: "admin_count", label: "System Administrators", value: 8, status: "MONITOR", detail: "8 System Administrators — review whether all require full admin access." },
          { key: "api_users", label: "API Integration Users", value: 5, status: "HEALTHY", detail: "5 integration users — credentials should be rotated post-migration." },
          { key: "auth_providers", label: "Auth Providers (SSO)", value: 2, status: "HEALTHY", detail: "Google SSO and Okta SAML configured — reconfigure in target org." },
          { key: "inactive_users", label: "Inactive Users", value: 25, status: "HEALTHY", detail: "25 inactive users — license reclamation opportunity." },
        ],
      },
      {
        key: "limits",
        label: "API & Limits",
        score: 91,
        kpis: [
          { key: "daily_api", label: "Daily API Usage", value: "3%", status: "HEALTHY", detail: "150K of 5M daily API requests used." },
          { key: "apex_coverage", label: "Apex Test Coverage", value: 74, status: "MONITOR", detail: "74% org-wide coverage — 3 classes below 75% will block deployment." },
          { key: "bulk_api", label: "Bulk API Usage", value: "0.6%", status: "HEALTHY", detail: "60 of 10,000 daily bulk API requests used." },
        ],
      },
    ],
    methodology: {
      weights: { governance: 0.2, automation: 0.25, data: 0.2, security: 0.2, limits: 0.15 },
      statusToPoints: { HEALTHY: 100, MONITOR: 60, RISK: 10, NA: 50 },
      notes: ["Score reflects migration complexity, not org operational health.", "HIGH findings significantly reduce category scores."],
    },
  },
};

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    if (process.env.MODE === "demo") {
      return NextResponse.json(DEMO_SCAN_OUTPUT);
    }

    const session = await requireSession();
    const scanStartTime = Date.now();

    const scanOutput = await runScan(
      session.accessToken!,
      session.instanceUrl!,
      session.apiVersion || "v60.0",
      requestId
    );

    // Check if scan returned meaningful data
    // Only fail if we have NO data at all (not even standard objects)
    // Some orgs may legitimately have 0 custom objects or 0 automation
    const hasAnyData = 
      scanOutput.inventory.sourceObjects.length > 0 ||
      scanOutput.inventory.automation.flows.length > 0 ||
      scanOutput.inventory.automation.triggers.length > 0 ||
      scanOutput.inventory.code.apexClasses.length > 0 ||
      scanOutput.inventory.code.apexTriggers.length > 0 ||
      scanOutput.inventory.reporting.reports.length > 0;
    
    if (!hasAnyData) {
      logger.warn("Scan returned no data at all - possible auth or permissions issue");
      return NextResponse.json(
        { error: "Scan completed but no data was retrieved. This may indicate an authentication issue or insufficient API permissions. Please check your Salesforce connection and permissions.", traceId: requestId },
        { status: 401 }
      );
    }
    
    // Log summary for debugging
    logger.info({
      objects: scanOutput.summary.objects,
      flows: scanOutput.summary.flows,
      triggers: scanOutput.summary.triggers,
      vrs: scanOutput.summary.vrs,
      apexClasses: scanOutput.inventory.code.apexClasses.length,
      apexTriggers: scanOutput.inventory.code.apexTriggers.length,
      reports: scanOutput.inventory.reporting.reports.length,
    }, "Scan data summary");

    // Save scan
    const orgConnectionId = await ensureOrgConnection(
      session.instanceUrl!,
      scanOutput.source.orgId,
      scanOutput.source.edition || "Unknown",
      requestId
    );
    const savedScan = await saveScan(orgConnectionId, scanOutput, requestId);

    const scanEndTime = Date.now();
    const scanDuration = scanEndTime - scanStartTime;
    const scanDurationSeconds = parseFloat((scanDuration / 1000).toFixed(1));

    logger.info({ duration: scanDurationSeconds, durationMs: scanDuration, scanId: savedScan.id }, "Scan completed");

    return NextResponse.json({
      ...scanOutput,
      scanId: savedScan.id,
      scanDuration,
      scanDurationSeconds,
    });
  } catch (error: any) {
    logger.error({ error, stack: error.stack }, "Scan failed");
    return NextResponse.json(
      { error: error.message || "Scan failed", traceId: requestId },
      { status: error.statusCode || 500 }
    );
  }
}


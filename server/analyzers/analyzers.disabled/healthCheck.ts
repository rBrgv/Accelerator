import { HealthComputation, HealthCategory, HealthKpi, ScanOutput } from "@/lib/types";
import { soql, limits } from "../salesforce/rest";
import { createLogger } from "../logger";

const CATEGORY_WEIGHTS = {
  governance: 25,
  automation: 25,
  data: 20,
  security: 15,
  limits: 15,
};

const STATUS_POINTS = {
  HEALTHY: 3,
  MONITOR: 1,
  RISK: 0,
  NA: 1,
};

export async function computeHealth(
  scan: ScanOutput | any,
  opts?: { instanceUrl?: string; token?: string; apiVersion?: string }
): Promise<HealthComputation> {
  const logger = createLogger();
  
  try {
    const source = scan.source || scan;
    const inventory = scan.inventory || {};
    const schema = inventory.sourceObjects || [];
    const automation = inventory.automation || {};
    const code = inventory.code || {};
    const security = inventory.security;
    const ownership = inventory.ownership || {};
    
    const categories: HealthCategory[] = [];
    
    // Governance Category
    const governanceKpis: HealthKpi[] = [];
    
    // Single Trigger per Object
    const triggersByObject = new Map<string, number>();
    (automation.triggers || []).forEach((t: any) => {
      const obj = t.tableEnumOrId || t.object;
      if (obj) {
        triggersByObject.set(obj, (triggersByObject.get(obj) || 0) + 1);
      }
    });
    const triggerCounts = Array.from(triggersByObject.values());
    const objectsWithMultipleTriggers = triggerCounts.filter(count => count > 1).length;
    const maxTriggersPerObject = triggerCounts.length > 0 ? Math.max(...triggerCounts) : 0;
    governanceKpis.push({
      key: "singleTriggerPerObject",
      label: "Single Trigger per Object",
      value: objectsWithMultipleTriggers,
      status: maxTriggersPerObject > 2 ? "RISK" : maxTriggersPerObject === 2 ? "MONITOR" : "HEALTHY",
      detail: `${objectsWithMultipleTriggers} objects have multiple triggers`,
    });
    
    // Total Apex Classes
    const apexClassCount = (code.apexClasses || []).length;
    governanceKpis.push({
      key: "totalApexClasses",
      label: "Total Apex Classes",
      value: apexClassCount,
      status: apexClassCount > 1500 ? "RISK" : apexClassCount >= 500 ? "MONITOR" : "HEALTHY",
    });
    
    // Code Coverage
    const orgWideCoverage = code.coverage?.orgWidePercent;
    if (orgWideCoverage !== null && orgWideCoverage !== undefined) {
      governanceKpis.push({
        key: "codeCoverage",
        label: "Code Coverage",
        value: `${orgWideCoverage}%`,
        status: orgWideCoverage >= 75 ? "HEALTHY" : orgWideCoverage >= 60 ? "MONITOR" : "RISK",
      });
    } else {
      governanceKpis.push({
        key: "codeCoverage",
        label: "Code Coverage",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // API Version Consistency
    const apexVersions = new Set((code.apexClasses || []).map((c: any) => c.apiVersion));
    const flowVersions = new Set((automation.flows || []).map((f: any) => f.apiVersion));
    const allVersions = new Set([...apexVersions, ...flowVersions]);
    const currentApiVersion = source.apiVersion || "v60.0";
    const currentMajor = parseInt(currentApiVersion.replace("v", "").split(".")[0]);
    let maxLag = 0;
    for (const v of allVersions) {
      const versionStr = String(v);
      const major = parseInt(versionStr.replace("v", "").split(".")[0]);
      const lag = currentMajor - major;
      if (lag > maxLag) maxLag = lag;
    }
    governanceKpis.push({
      key: "apiVersionConsistency",
      label: "API Version Consistency",
      value: maxLag > 0 ? `${maxLag} versions behind` : "Current",
      status: maxLag > 5 ? "RISK" : maxLag > 2 ? "MONITOR" : "HEALTHY",
    });
    
    // Profiles vs Permission Sets ratio
    const profileCount = security?.totalProfiles || 0;
    const permSetCount = security?.totalPermissionSets || 0;
    const ratio = profileCount > 0 ? permSetCount / profileCount : 0;
    governanceKpis.push({
      key: "profilesPermSetsRatio",
      label: "Profiles vs Permission Sets Ratio",
      value: ratio > 0 ? `1:${ratio.toFixed(1)}` : "N/A",
      status: ratio > 5 ? "RISK" : ratio > 3 ? "MONITOR" : "HEALTHY",
    });
    
    const governanceScore = calculateCategoryScore(governanceKpis);
    categories.push({
      key: "governance",
      label: "Governance",
      score: governanceScore,
      kpis: governanceKpis,
    });
    
    // Automation Category
    const automationKpis: HealthKpi[] = [];
    
    // Active Flows ratio
    const totalFlows = automation.flowSummary?.total ?? (automation.flows || []).length;
    const activeFlows = automation.flowSummary?.active ?? (automation.flows || []).filter((f: any) => f.status === "Active").length;
    const activeFlowRatio = totalFlows > 0 ? (activeFlows / totalFlows) * 100 : 0;
    automationKpis.push({
      key: "activeFlowsRatio",
      label: "Active Flows Ratio",
      value: `${activeFlowRatio.toFixed(1)}%`,
      status: activeFlowRatio >= 20 ? "HEALTHY" : activeFlowRatio > 0 ? "MONITOR" : "RISK",
    });
    
    // Process Builders (check flows for Process Builder type)
    const processBuilders = (automation.flows || []).filter((f: any) => f.processType === "ProcessBuilder" || f.processType === "Workflow").length;
    automationKpis.push({
      key: "processBuilders",
      label: "Process Builders Present",
      value: processBuilders,
      status: processBuilders === 0 ? "HEALTHY" : "MONITOR",
    });
    
    // Triggers per Object (already computed above)
    automationKpis.push({
      key: "triggersPerObject",
      label: "Triggers per Object",
      value: maxTriggersPerObject,
      status: maxTriggersPerObject > 2 ? "RISK" : maxTriggersPerObject === 2 ? "MONITOR" : "HEALTHY",
    });
    
    // Validation Rules per Object
    const validationRules = Array.isArray(automation.validationRules) 
      ? automation.validationRules 
      : [];
    const vrByObject = new Map<string, number>();
    validationRules.forEach((vr: any) => {
      const obj = vr.fullName?.split(".")[0] || "Unknown";
      vrByObject.set(obj, (vrByObject.get(obj) || 0) + 1);
    });
    const maxVRPerObject = Math.max(...Array.from(vrByObject.values()), 0);
    automationKpis.push({
      key: "validationRulesPerObject",
      label: "Validation Rules per Object",
      value: maxVRPerObject,
      status: maxVRPerObject > 50 ? "RISK" : maxVRPerObject > 20 ? "MONITOR" : "HEALTHY",
    });
    
    // Workflow Rules active
    const workflowRules = Array.isArray(automation.workflowRules)
      ? automation.workflowRules
      : [];
    const activeWorkflowRules = workflowRules.filter((wr: any) => wr.active).length;
    const workflowRulesCount = automation.workflowRules && typeof automation.workflowRules === "object" && "active" in automation.workflowRules
      ? (automation.workflowRules as any).active || 0
      : activeWorkflowRules;
    automationKpis.push({
      key: "workflowRulesActive",
      label: "Workflow Rules Active",
      value: workflowRulesCount,
      status: workflowRulesCount === 0 ? "HEALTHY" : "MONITOR",
    });
    
    const automationScore = calculateCategoryScore(automationKpis);
    categories.push({
      key: "automation",
      label: "Automation",
      score: automationScore,
      kpis: automationKpis,
    });
    
    // Data Category
    const dataKpis: HealthKpi[] = [];
    
    // Used Data Storage
    const dataUsedPct = source.storage?.data?.usedPct;
    if (dataUsedPct !== null && dataUsedPct !== undefined) {
      dataKpis.push({
        key: "dataStorage",
        label: "Used Data Storage",
        value: `${dataUsedPct.toFixed(1)}%`,
        status: dataUsedPct > 95 ? "RISK" : dataUsedPct >= 85 ? "MONITOR" : "HEALTHY",
      });
    } else {
      dataKpis.push({
        key: "dataStorage",
        label: "Used Data Storage",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // Used File Storage
    const fileUsedPct = source.storage?.file?.usedPct;
    if (fileUsedPct !== null && fileUsedPct !== undefined) {
      dataKpis.push({
        key: "fileStorage",
        label: "Used File Storage",
        value: `${fileUsedPct.toFixed(1)}%`,
        status: fileUsedPct > 95 ? "RISK" : fileUsedPct >= 85 ? "MONITOR" : "HEALTHY",
      });
    } else {
      dataKpis.push({
        key: "fileStorage",
        label: "Used File Storage",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // High-Volume Objects
    const highVolumeObjects = schema.filter((obj: any) => (obj.recordCount || 0) >= 100000).length;
    dataKpis.push({
      key: "highVolumeObjects",
      label: "High-Volume Objects (≥100k)",
      value: highVolumeObjects,
      status: highVolumeObjects > 10 ? "RISK" : highVolumeObjects > 5 ? "MONITOR" : "HEALTHY",
    });
    
    // Objects without Validation Rules
    const objectsWithVR = new Set(validationRules.map((vr: any) => vr.fullName?.split(".")[0]).filter(Boolean));
    const objectsWithoutVR = schema.filter((obj: any) => !objectsWithVR.has(obj.name)).length;
    const pctWithoutVR = schema.length > 0 ? (objectsWithoutVR / schema.length) * 100 : 0;
    dataKpis.push({
      key: "objectsWithoutVR",
      label: "Objects without Validation Rules",
      value: `${pctWithoutVR.toFixed(1)}%`,
      status: pctWithoutVR > 80 ? "RISK" : pctWithoutVR >= 50 ? "MONITOR" : "HEALTHY",
    });
    
    // Inactive Users share
    const users = ownership.users || [];
    const inactiveUsers = users.filter((u: any) => !u.active).length;
    const inactiveUserPct = users.length > 0 ? (inactiveUsers / users.length) * 100 : 0;
    if (users.length > 0) {
      dataKpis.push({
        key: "inactiveUsers",
        label: "Inactive Users Share",
        value: `${inactiveUserPct.toFixed(1)}%`,
        status: inactiveUserPct > 20 ? "RISK" : inactiveUserPct >= 10 ? "MONITOR" : "HEALTHY",
      });
    } else {
      dataKpis.push({
        key: "inactiveUsers",
        label: "Inactive Users Share",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    const dataScore = calculateCategoryScore(dataKpis);
    categories.push({
      key: "data",
      label: "Data",
      score: dataScore,
      kpis: dataKpis,
    });
    
    // Security Category
    const securityKpis: HealthKpi[] = [];
    
    // Profiles with ModifyAll/ViewAllData (simplified - would need metadata retrieve)
    securityKpis.push({
      key: "profilesModifyAll",
      label: "Profiles with ModifyAll/ViewAllData",
      value: null,
      status: "NA",
      detail: "Requires metadata retrieve",
    });
    
    // Guest/Community users
    securityKpis.push({
      key: "guestUsers",
      label: "Guest/Community Users with High Access",
      value: null,
      status: "NA",
      detail: "Not available via current scan",
    });
    
    // Inactive Queues
    const queues = ownership.queues || [];
    securityKpis.push({
      key: "inactiveQueues",
      label: "Inactive Queues",
      value: queues.length,
      status: queues.length === 0 ? "HEALTHY" : "MONITOR",
    });
    
    // Sharing Rules (would need metadata retrieve)
    securityKpis.push({
      key: "sharingRules",
      label: "Sharing Rules Present",
      value: null,
      status: "NA",
      detail: "Requires metadata retrieve",
    });
    
    // Users without Role
    if (users.length > 0) {
      const usersWithoutRole = users.filter((u: any) => !u.role).length;
      const pctWithoutRole = (usersWithoutRole / users.length) * 100;
      securityKpis.push({
        key: "usersWithoutRole",
        label: "Users without Role",
        value: `${pctWithoutRole.toFixed(1)}%`,
        status: pctWithoutRole > 15 ? "RISK" : pctWithoutRole >= 5 ? "MONITOR" : "HEALTHY",
      });
    } else {
      securityKpis.push({
        key: "usersWithoutRole",
        label: "Users without Role",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    const securityScore = calculateCategoryScore(securityKpis);
    categories.push({
      key: "security",
      label: "Security",
      score: securityScore,
      kpis: securityKpis,
    });
    
    // Limits Category
    const limitsKpis: HealthKpi[] = [];
    
    // Try to fetch limits if credentials provided
    let limitsData: any = null;
    if (opts?.instanceUrl && opts?.token && opts?.apiVersion) {
      try {
        limitsData = await limits(opts.instanceUrl, opts.token, opts.apiVersion, undefined);
      } catch (error) {
        logger.debug({ error }, "Failed to fetch limits");
      }
    }
    
    // API Calls 24h usage
    if (limitsData?.DailyApiRequests) {
      const apiUsed = limitsData.DailyApiRequests.Used || 0;
      const apiMax = limitsData.DailyApiRequests.Max || 1;
      const apiPct = (apiUsed / apiMax) * 100;
      limitsKpis.push({
        key: "apiCalls24h",
        label: "API Calls 24h Usage",
        value: `${apiPct.toFixed(1)}%`,
        status: apiPct > 95 ? "RISK" : apiPct >= 80 ? "MONITOR" : "HEALTHY",
      });
    } else {
      limitsKpis.push({
        key: "apiCalls24h",
        label: "API Calls 24h Usage",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // Async Apex Queue Usage
    if (limitsData?.DailyAsyncApexExecutions) {
      const asyncUsed = limitsData.DailyAsyncApexExecutions.Used || 0;
      const asyncMax = limitsData.DailyAsyncApexExecutions.Max || 1;
      const asyncPct = (asyncUsed / asyncMax) * 100;
      limitsKpis.push({
        key: "asyncApexQueue",
        label: "Async Apex Queue Usage",
        value: `${asyncPct.toFixed(1)}%`,
        status: asyncPct > 95 ? "RISK" : asyncPct >= 80 ? "MONITOR" : "HEALTHY",
      });
    } else {
      limitsKpis.push({
        key: "asyncApexQueue",
        label: "Async Apex Queue Usage",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // Concurrent Batch Jobs
    if (limitsData?.ConcurrentAsyncGetReportInstances) {
      const batchUsed = limitsData.ConcurrentAsyncGetReportInstances.Used || 0;
      limitsKpis.push({
        key: "concurrentBatchJobs",
        label: "Concurrent Batch Jobs Queued",
        value: batchUsed,
        status: batchUsed >= 5 ? "MONITOR" : "HEALTHY",
      });
    } else {
      limitsKpis.push({
        key: "concurrentBatchJobs",
        label: "Concurrent Batch Jobs Queued",
        value: null,
        status: "NA",
        detail: "Not available via current scan",
      });
    }
    
    // Data Skew Objects
    limitsKpis.push({
      key: "dataSkewObjects",
      label: "Data Skew Objects (owner >10%)",
      value: null,
      status: "NA",
      detail: "Not computed in current scan",
    });
    
    // Integration user count
    limitsKpis.push({
      key: "integrationUsers",
      label: "Integration User Count",
      value: null,
      status: "NA",
      detail: "Not computed in current scan",
    });
    
    const limitsScore = calculateCategoryScore(limitsKpis);
    categories.push({
      key: "limits",
      label: "Limits",
      score: limitsScore,
      kpis: limitsKpis,
    });
    
    // Calculate overall score
    const availableCategories = categories.filter(c => c.score !== null);
    let overallScore: number | null = null;
    if (availableCategories.length > 0) {
      const weightedSum = availableCategories.reduce((sum, cat) => {
        const weight = CATEGORY_WEIGHTS[cat.key];
        return sum + (cat.score! * weight);
      }, 0);
      const totalWeight = availableCategories.reduce((sum, cat) => sum + CATEGORY_WEIGHTS[cat.key], 0);
      overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
    }
    
    return {
      overallScore,
      categories,
      methodology: {
        weights: CATEGORY_WEIGHTS,
        statusToPoints: STATUS_POINTS,
        notes: [
          "Each KPI is assigned a status of Healthy, Monitor, Risk, or N/A based on a fixed threshold.",
          "Category scores are normalized to a 0–100 scale using status-to-points mapping (Healthy=3, Monitor=1, Risk=0, N/A=1).",
          `Overall score is the weighted average of category scores using Governance ${CATEGORY_WEIGHTS.governance}%, Automation ${CATEGORY_WEIGHTS.automation}%, Data ${CATEGORY_WEIGHTS.data}%, Security ${CATEGORY_WEIGHTS.security}%, and Limits ${CATEGORY_WEIGHTS.limits}%.`,
          "N/A does not penalize the score but reduces the denominator for that category.",
          "Metrics are computed from inventory gathered via REST, Tooling, and Metadata APIs during the scan.",
        ],
      },
    };
  } catch (error: any) {
    logger.error({ error }, "Failed to compute health");
    return {
      overallScore: null,
      categories: [],
      methodology: {
        weights: CATEGORY_WEIGHTS,
        statusToPoints: STATUS_POINTS,
        notes: ["Health computation failed"],
      },
    };
  }
}

function calculateCategoryScore(kpis: HealthKpi[]): number | null {
  const nonNAKpis = kpis.filter(k => k.status !== "NA");
  if (nonNAKpis.length === 0) return null;
  
  const totalPoints = nonNAKpis.reduce((sum, kpi) => sum + STATUS_POINTS[kpi.status], 0);
  const maxPossiblePoints = nonNAKpis.length * STATUS_POINTS.HEALTHY;
  const score = (totalPoints / maxPossiblePoints) * 100;
  return Math.round(score);
}


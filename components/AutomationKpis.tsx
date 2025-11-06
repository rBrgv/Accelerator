"use client";

import { AutomationIndex } from "@/lib/types";
import KPI from "./KPI";

interface AutomationKpisProps {
  automation: AutomationIndex;
}

export default function AutomationKpis({ automation }: AutomationKpisProps) {
  const totalFlows = automation.flows.length;
  const activeTriggers = automation.triggers.filter((t) => t.status === "Active").length;
  const activeVrs = automation.validationRules.filter((vr) => vr.active).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <KPI
        label="Flows"
        value={totalFlows}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />
      <KPI
        label="Triggers"
        value={activeTriggers}
        subtitle={`Total: ${automation.triggers.length}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      />
      <KPI
        label="Validation Rules"
        value={activeVrs}
        subtitle={`Total: ${automation.validationRules.length}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}


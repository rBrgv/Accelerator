"use client";

import { CodeIndex } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface CodeCoveragePanelProps {
  code?: CodeIndex;
}

export default function CodeCoveragePanel({ code }: CodeCoveragePanelProps) {
  if (!code?.coverage) {
    return null;
  }

  const { orgWidePercent, byClass, lastComputedAt, note } = code.coverage;

  if (note) {
    return (
      <CollapsibleSection title="Apex Code Coverage" defaultOpen={true}>
        <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3">
          {note}
        </div>
      </CollapsibleSection>
    );
  }

  const classesBelow75 = byClass.filter(c => (c.percent ?? 0) < 75).length;
  const classesBelow50 = byClass.filter(c => (c.percent ?? 0) < 50).length;

  return (
    <CollapsibleSection 
      title={`Apex Code Coverage${lastComputedAt ? ` - Last computed: ${new Date(lastComputedAt).toLocaleDateString()}` : ""}`}
      defaultOpen={true}
    >
      <div className="space-y-6">
      {orgWidePercent !== null && orgWidePercent !== undefined && (
        <div>
          <div className="flex items-center gap-4 mb-2">
            <span className="text-sm font-medium text-gray-700">Org-Wide Coverage:</span>
            <span className={`text-2xl font-bold ${
              orgWidePercent >= 75 ? "text-green-600" : 
              orgWidePercent >= 50 ? "text-yellow-600" : 
              "text-red-600"
            }`}>
              {orgWidePercent}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                orgWidePercent >= 75 ? "bg-green-600" : 
                orgWidePercent >= 50 ? "bg-yellow-600" : 
                "bg-red-600"
              }`}
              style={{ width: `${orgWidePercent}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded">
          <div className="text-2xl font-bold text-blue-600">{byClass.length}</div>
          <div className="text-xs text-gray-600">Classes/Triggers with Coverage</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded">
          <div className="text-2xl font-bold text-yellow-600">{classesBelow75}</div>
          <div className="text-xs text-gray-600">Below 75%</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded">
          <div className="text-2xl font-bold text-red-600">{classesBelow50}</div>
          <div className="text-xs text-gray-600">Below 50%</div>
        </div>
      </div>
      

      {byClass.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Class Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coverage %</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lines Covered</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lines Uncovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {byClass
                .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
                .slice(0, 20)
                .map((cls) => (
                  <tr key={cls.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{cls.name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        (cls.percent ?? 0) >= 75 ? "bg-green-100 text-green-800" :
                        (cls.percent ?? 0) >= 50 ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {cls.percent ?? 0}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{cls.numLinesCovered.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-600">{cls.numLinesUncovered.toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {byClass.length > 20 && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              Showing top 20 classes with lowest coverage. Total: {byClass.length} classes.
            </div>
          )}
        </div>
      )}
      </div>
    </CollapsibleSection>
  );
}


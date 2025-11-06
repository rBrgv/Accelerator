"use client";

import { ObjectStat, ScanOutput } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface DataQualityProps {
  scanData: ScanOutput;
}

export default function DataQuality({ scanData }: DataQualityProps) {
  const objects = scanData.inventory.sourceObjects;
  
  // Calculate data quality metrics
  const requiredFieldsNoDefault = objects.reduce((sum: number, obj) => 
    sum + obj.fields.filter(f => f.required && !f.nillable).length
  , 0);
  
  const longTextFields = objects.reduce((sum: number, obj) => 
    sum + obj.fields.filter(f => (f.type === "textarea" || f.type === "richtextarea") && f.length && f.length > 255).length
  , 0);
  
  const richTextFields = objects.reduce((sum: number, obj) => 
    sum + obj.fields.filter(f => f.type === "richtextarea").length
  , 0);
  
  const objectsWithRequiredFields = objects.filter(obj => 
    obj.fields.some(f => f.required && !f.nillable)
  ).length;
  
  const objectsWithLongText = objects.filter(obj => 
    obj.fields.some(f => (f.type === "textarea" || f.type === "richtextarea") && f.length && f.length > 255)
  ).length;
  
  // Feature flags (from org profile)
  const org = scanData.source.organization || {};
  const isPersonAccountsEnabled = org.IsPersonAccountEnabled || false;
  const isEmailToCaseEnabled = org.IsEmailToCaseEnabled || false;
  const isMultiCurrencyEnabled = org.IsMultiCurrencyEnabled || false;
  const isStateCountryPicklistsEnabled = org.IsStateCountryPicklistsEnabled || false;
  
  return (
    <CollapsibleSection title="Data Quality & Shape" defaultOpen={false}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600">Required Fields (No Default)</div>
            <div className="text-2xl font-bold text-blue-900">{requiredFieldsNoDefault}</div>
            <div className="text-xs text-gray-500 mt-1">{objectsWithRequiredFields} objects</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-gray-600">Long Text Fields</div>
            <div className="text-2xl font-bold text-purple-900">{longTextFields}</div>
            <div className="text-xs text-gray-500 mt-1">{objectsWithLongText} objects</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-lg">
            <div className="text-sm text-gray-600">Rich Text Fields</div>
            <div className="text-2xl font-bold text-indigo-900">{richTextFields}</div>
            <div className="text-xs text-gray-500 mt-1">Loader considerations</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-gray-600">External IDs</div>
            <div className="text-2xl font-bold text-green-900">
              {objects.reduce((sum: number, obj) => sum + obj.fields.filter(f => f.externalId === true).length, 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">For record matching</div>
          </div>
        </div>
        
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Feature Flags & Settings</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`p-3 rounded-lg border ${isPersonAccountsEnabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="text-xs text-gray-600">Person Accounts</div>
              <div className={`text-sm font-medium ${isPersonAccountsEnabled ? "text-green-800" : "text-gray-600"}`}>
                {isPersonAccountsEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${isEmailToCaseEnabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="text-xs text-gray-600">Email-to-Case</div>
              <div className={`text-sm font-medium ${isEmailToCaseEnabled ? "text-green-800" : "text-gray-600"}`}>
                {isEmailToCaseEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${isMultiCurrencyEnabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="text-xs text-gray-600">Multi-Currency</div>
              <div className={`text-sm font-medium ${isMultiCurrencyEnabled ? "text-green-800" : "text-gray-600"}`}>
                {isMultiCurrencyEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${isStateCountryPicklistsEnabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="text-xs text-gray-600">State/Country Picklists</div>
              <div className={`text-sm font-medium ${isStateCountryPicklistsEnabled ? "text-green-800" : "text-gray-600"}`}>
                {isStateCountryPicklistsEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
          </div>
        </div>
        
        {requiredFieldsNoDefault > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Top Objects with Required Fields (Create-time Blockers)</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {objects
                .filter(obj => obj.fields.some(f => f.required && !f.nillable))
                .sort((a, b) => {
                  const aCount = a.fields.filter(f => f.required && !f.nillable).length;
                  const bCount = b.fields.filter(f => f.required && !f.nillable).length;
                  return bCount - aCount;
                })
                .slice(0, 10)
                .map(obj => {
                  const count = obj.fields.filter(f => f.required && !f.nillable).length;
                  return (
                    <div key={obj.name} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <span className="font-medium">{obj.label || obj.name}</span>
                      <span className="text-gray-600">{count} required field{count !== 1 ? "s" : ""}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}


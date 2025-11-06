"use client";

import { IntegrationIndex } from "@/lib/types";

interface IntegrationSummaryProps {
  integrations?: IntegrationIndex;
}

export default function IntegrationSummary({ integrations }: IntegrationSummaryProps) {
  if (!integrations) return null;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b">
        <h3 className="text-lg font-semibold">Integrations & External Connections</h3>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600">Connected Apps</div>
            <div className="text-2xl font-bold">{integrations.connectedApps.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Named Credentials</div>
            <div className="text-2xl font-bold">{integrations.namedCredentials.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Remote Site Settings</div>
            <div className="text-2xl font-bold">{integrations.remoteSiteSettings.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Auth Providers</div>
            <div className="text-2xl font-bold">{integrations.authProviders.length}</div>
          </div>
        </div>

        {integrations.connectedApps.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Connected Apps</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {integrations.connectedApps.map((app) => (
                <div key={app.id} className="p-2 bg-gray-50 rounded text-sm">
                  <span className="font-medium">{app.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {integrations.namedCredentials.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Named Credentials</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {integrations.namedCredentials.map((nc) => (
                <div key={nc.id} className="p-2 bg-gray-50 rounded text-sm">
                  <div className="font-medium">{nc.fullName}</div>
                  {nc.endpoint && <div className="text-xs text-gray-500">{nc.endpoint}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {integrations.remoteSiteSettings.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Remote Site Settings</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {integrations.remoteSiteSettings.map((rss) => (
                <div key={rss.id} className="p-2 bg-gray-50 rounded text-sm">
                  <div className="font-medium">{rss.fullName}</div>
                  {rss.url && <div className="text-xs text-gray-500">{rss.url}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


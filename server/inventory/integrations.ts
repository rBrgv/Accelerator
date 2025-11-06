import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export interface IntegrationIndex {
  connectedApps: Array<{ id: string; name: string; createdDate?: string }>;
  namedCredentials: Array<{ id: string; fullName: string; endpoint?: string }>;
  remoteSiteSettings: Array<{ id: string; fullName: string; url?: string }>;
  authProviders: Array<{ id: string; fullName: string; providerType?: string }>;
}

export async function fetchIntegrationIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<IntegrationIndex> {
  const logger = createLogger(requestId);
  
  try {
    const [connectedAppsResult, namedCredsResult, remoteSitesResult, authProvidersResult] = await Promise.all([
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, DeveloperName, CreatedDate FROM ConnectedApplication",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, FullName, Endpoint FROM NamedCredential",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, FullName, Url FROM RemoteSiteSetting",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, FullName, ProviderType FROM AuthProvider",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
    ]);

    const connectedApps = (connectedAppsResult.records || []).map((ca: any) => ({
      id: ca.Id,
      name: ca.DeveloperName,
      createdDate: ca.CreatedDate,
    }));

    const namedCredentials = (namedCredsResult.records || []).map((nc: any) => ({
      id: nc.Id,
      fullName: nc.FullName,
      endpoint: nc.Endpoint,
    }));

    const remoteSiteSettings = (remoteSitesResult.records || []).map((rss: any) => ({
      id: rss.Id,
      fullName: rss.FullName,
      url: rss.Url,
    }));

    const authProviders = (authProvidersResult.records || []).map((ap: any) => ({
      id: ap.Id,
      fullName: ap.FullName,
      providerType: ap.ProviderType,
    }));

    logger.info(
      {
        connectedApps: connectedApps.length,
        namedCredentials: namedCredentials.length,
        remoteSiteSettings: remoteSiteSettings.length,
        authProviders: authProviders.length,
      },
      "Integration index fetched"
    );

    return {
      connectedApps,
      namedCredentials,
      remoteSiteSettings,
      authProviders,
    };
  } catch (error: any) {
    logger.warn({ error: error.message }, "Failed to fetch some integration data (may require permissions)");
    return {
      connectedApps: [],
      namedCredentials: [],
      remoteSiteSettings: [],
      authProviders: [],
    };
  }
}


import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export async function fetchPackageNamespaces(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<Array<{ namespace: string; name: string }>> {
  const logger = createLogger(requestId);
  
  try {
    const result = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT NamespacePrefix, Name FROM InstalledSubscriberPackage",
      requestId
    );
    
    const packages = (result.records || [])
      .filter((p: any) => p.NamespacePrefix)
      .map((p: any) => ({
        namespace: p.NamespacePrefix,
        name: p.Name || p.NamespacePrefix,
      }));
    
    logger.info({ count: packages.length }, "Package namespaces fetched");
    return packages;
  } catch (error: any) {
    logger.warn({ error: error.message }, "Failed to fetch packages (may not have access)");
    return [];
  }
}

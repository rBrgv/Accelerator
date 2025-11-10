import axios, { AxiosInstance } from "axios";
import { createLogger } from "../logger";

const logger = createLogger();

function createClient(instanceUrl: string, accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: instanceUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

export async function sfGet(
  instanceUrl: string,
  accessToken: string,
  path: string,
  requestId?: string
): Promise<any> {
  const log = createLogger(requestId);
  const client = createClient(instanceUrl, accessToken);
  
  try {
    const response = await client.get(path);
    // Log describeGlobal calls for debugging
    if (path.includes('/sobjects/') && !path.includes('/describe/')) {
      const data = response.data;
      const objectCount = data?.sobjects?.length || 0;
      console.log(`[sfGet] describeGlobal SUCCESS: ${objectCount} objects available`);
    }
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      const authError = new Error("Access token expired or invalid");
      (authError as any).statusCode = 401;
      (authError as any).isAuthError = true;
      throw authError;
    }
    const status = error.response?.status;
    const errorMsg = error.response?.data?.message || error.message;
    // Log describeGlobal failures specifically
    if (path.includes('/sobjects/') && !path.includes('/describe/')) {
      console.error(`[sfGet] describeGlobal FAILED: ${errorMsg} (Status: ${status || 'unknown'})`);
      if (error.response?.data) {
        console.error(`[sfGet] Error details:`, JSON.stringify(error.response.data, null, 2));
      }
    }
    log.error({ error: error.message, status, path }, "SF API error");
    throw error;
  }
}

export async function soql(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  query: string,
  requestId?: string,
  opts?: { tooling?: boolean }
): Promise<any> {
  const log = createLogger(requestId);
  const basePath = opts?.tooling
    ? `/services/data/${apiVersion}/tooling/query`
    : `/services/data/${apiVersion}/query`;
  
  try {
    const data = await sfGet(instanceUrl, accessToken, `${basePath}?q=${encodeURIComponent(query)}`, requestId);
    const recordCount = data?.records?.length || 0;
    const apiType = opts?.tooling ? "Tooling" : "REST";
    console.log(`[SOQL ${apiType}] Query executed: ${recordCount} records returned`);
    if (recordCount === 0 && data?.totalSize !== undefined) {
      console.log(`[SOQL ${apiType}] Total size: ${data.totalSize}, but records array is empty`);
    }
    return data;
  } catch (error: any) {
    const apiType = opts?.tooling ? "Tooling" : "REST";
    const status = error.response?.status;
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`[SOQL ${apiType}] Query FAILED: ${errorMsg} (Status: ${status || 'unknown'})`);
    console.error(`[SOQL ${apiType}] Query was: ${query.substring(0, 100)}...`);
    log.error({ error: error.message, status, query, apiType }, `SOQL ${apiType} error`);
    throw error;
  }
}

export async function limits(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<any> {
  const log = createLogger(requestId);
  try {
    const data = await sfGet(instanceUrl, accessToken, `/services/data/${apiVersion}/limits`, requestId);
    return data;
  } catch (error: any) {
    log.error({ error: error.message }, "Limits API error");
    throw error;
  }
}


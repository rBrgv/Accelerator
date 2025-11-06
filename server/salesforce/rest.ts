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
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      const authError = new Error("Access token expired or invalid");
      (authError as any).statusCode = 401;
      (authError as any).isAuthError = true;
      throw authError;
    }
    log.error({ error: error.message, status: error.response?.status, path }, "SF API error");
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
    return data;
  } catch (error: any) {
    const apiType = opts?.tooling ? "Tooling" : "REST";
    log.error({ error: error.message, query, apiType }, `SOQL ${apiType} error`);
    throw error;
  }
}


import axios from "axios";

export async function getAuthUrl(env: "prod" | "sandbox" | "custom", customDomain?: string): Promise<string> {
  let baseUrl = "https://login.salesforce.com";
  if (env === "sandbox") {
    baseUrl = "https://test.salesforce.com";
  } else if (env === "custom" && customDomain) {
    baseUrl = `https://${customDomain}`;
  }
  return `${baseUrl}/services/oauth2/authorize`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  env: "prod" | "sandbox" | "custom" = "prod",
  customDomain?: string
): Promise<{ accessToken: string; instanceUrl: string; apiVersion: string }> {
  let tokenUrl = "https://login.salesforce.com/services/oauth2/token";
  if (env === "sandbox") {
    tokenUrl = "https://test.salesforce.com/services/oauth2/token";
  } else if (env === "custom" && customDomain) {
    tokenUrl = `https://${customDomain}/services/oauth2/token`;
  }

  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("SF_CLIENT_ID and SF_CLIENT_SECRET must be configured");
  }

  try {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    return {
      accessToken: response.data.access_token,
      instanceUrl: response.data.instance_url,
      apiVersion: response.data.api_version || "v60.0",
    };
  } catch (error: any) {
    throw new Error(error.response?.data?.error_description || "Failed to exchange code");
  }
}

export async function authenticateWithSoapLogin(
  username: string,
  password: string,
  securityToken: string,
  loginUrl: string
): Promise<{ accessToken: string; instanceUrl: string; apiVersion: string }> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${escapeXml(username)}</urn:username>
      <urn:password>${escapeXml(password + securityToken)}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const response = await axios.post(loginUrl, soapBody, {
      headers: { "Content-Type": "text/xml; charset=UTF-8", "SOAPAction": "login" },
    });

    const result = response.data;
    const accessToken = result.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
    const serverUrl = result.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
    
    if (!accessToken || !serverUrl) {
      throw new Error("Failed to parse SOAP response");
    }

    const instanceUrl = serverUrl.replace(/\/services\/.*$/, "");
    return {
      accessToken,
      instanceUrl,
      apiVersion: "v60.0",
    };
  } catch (error: any) {
    if (error.response?.data) {
      const fault = error.response.data.match(/<faultstring>(.*?)<\/faultstring>/)?.[1];
      if (fault) {
        throw new Error(fault);
      }
    }
    throw error;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


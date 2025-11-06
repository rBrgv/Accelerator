"use client";

import { useState } from "react";

export default function ConnectCard() {
  const [environment, setEnvironment] = useState<"prod" | "sandbox" | "custom">("prod");
  const [customDomain, setCustomDomain] = useState("");
  const [authMethod, setAuthMethod] = useState<"oauth" | "password">("oauth");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityToken, setSecurityToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleOAuthConnect = () => {
    setIsConnecting(true);
    const params = new URLSearchParams();
    if (environment !== "prod") {
      params.append("env", environment);
    }
    if (environment === "custom" && customDomain) {
      params.append("domain", customDomain);
    }
    window.location.href = `/api/auth/start?${params.toString()}`;
  };

  const handlePasswordConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          securityToken,
          environment,
          customDomain: environment === "custom" ? customDomain : undefined,
        }),
      });

      if (response.ok) {
        window.location.href = "/dashboard?success=true";
      } else {
        const data = await response.json();
        alert(data.error || "Authentication failed");
        setIsConnecting(false);
      }
    } catch (error) {
      alert("Failed to connect. Please try again.");
      setIsConnecting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-2xl font-bold mb-6">Connect to Salesforce</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Authentication Method</label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="oauth"
              checked={authMethod === "oauth"}
              onChange={(e) => setAuthMethod(e.target.value as "oauth")}
              className="mr-2"
            />
            OAuth (Requires Connected App)
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="password"
              checked={authMethod === "password"}
              onChange={(e) => setAuthMethod(e.target.value as "password")}
              className="mr-2"
            />
            Username/Password
          </label>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Environment</label>
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as "prod" | "sandbox" | "custom")}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="prod">Production</option>
          <option value="sandbox">Sandbox</option>
          <option value="custom">Custom Domain</option>
        </select>
      </div>

      {environment === "custom" && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Custom Domain</label>
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="yourdomain.my.salesforce.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      )}

      {authMethod === "password" && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Security Token</label>
            <input
              type="text"
              value={securityToken}
              onChange={(e) => setSecurityToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get your security token from: Setup → My Personal Information → Reset My Security Token
            </p>
          </div>
        </>
      )}

      <button
        onClick={authMethod === "oauth" ? handleOAuthConnect : handlePasswordConnect}
        disabled={isConnecting || (authMethod === "password" && (!username || !password || !securityToken))}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? "Connecting..." : "Connect to Salesforce"}
      </button>

      {authMethod === "password" && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Security Note:</strong> Username/password authentication uses SOAP login. For production use, prefer OAuth with a Connected App.
        </div>
      )}
    </div>
  );
}


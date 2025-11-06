import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

export function createLogger(requestId?: string) {
  return pino({
    level: isDevelopment ? "debug" : "info",
    base: requestId ? { requestId } : undefined,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    redact: {
      paths: ["accessToken", "token", "password", "secret"],
      censor: "[REDACTED]",
    },
  });
}


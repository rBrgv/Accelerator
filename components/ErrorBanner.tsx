"use client";

interface ErrorBannerProps {
  message: string;
  traceId?: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, traceId, onDismiss }: ErrorBannerProps) {
  return (
    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-semibold mb-1">Error</div>
          <div>{message}</div>
          {traceId && (
            <div className="mt-2 text-xs text-red-600 font-mono">Trace ID: {traceId}</div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-4 text-red-600 hover:text-red-800"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}


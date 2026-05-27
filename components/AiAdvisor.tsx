"use client";

import { useState, useRef, useEffect } from "react";
import { ScanOutput } from "@/lib/types";
import CollapsibleSection from "./CollapsibleSection";

interface AiAdvisorProps {
  scanData: ScanOutput;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What should we prioritise first?",
  "Estimate the migration timeline",
  "What are the biggest blockers?",
  "How risky is this migration overall?",
  "What data migration strategy do you recommend?",
  "Explain the highest severity finding",
];

export default function AiAdvisor({ scanData }: AiAdvisorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = () => ({
    source: scanData.source,
    summary: scanData.summary,
    health: scanData.health,
    findings: scanData.findings,
    inventory: {
      sourceObjects: scanData.inventory.sourceObjects,
      automation: scanData.inventory.automation,
      code: { apexClasses: scanData.inventory.code.apexClasses, coverage: scanData.inventory.code.coverage },
      packages: scanData.inventory.packages,
    },
  });

  const ask = async (question: string) => {
    if (!question.trim() || isLoading) return;
    setError(null);
    setInput("");

    const userMessage: Message = { role: "user", content: question.trim() };
    const assistantPlaceholder: Message = { role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context: buildContext() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: full };
          return updated;
        });
      }
    } catch (err: any) {
      setMessages((prev) => prev.slice(0, -1)); // remove placeholder
      setError(err.message || "Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const orgName = scanData.source.organizationName || scanData.source.instanceUrl;

  return (
    <CollapsibleSection title="AI Migration Advisor" defaultOpen={true}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-200">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Claude — Migration Advisor</div>
            <div className="text-xs text-gray-600">
              Ask questions about <span className="font-medium">{orgName}</span> — powered by real scan data
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Ready
          </div>
        </div>

        {/* Suggested questions */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={isLoading}
                className="text-sm px-3 py-1.5 rounded-full border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Chat history */}
        {messages.length > 0 && (
          <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm"
                      : "bg-gray-50 border border-gray-200 text-gray-800 rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" && msg.content === "" && isLoading ? (
                    <span className="flex gap-1 items-center py-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this org's migration… (Enter to send, Shift+Enter for new line)"
            rows={2}
            disabled={isLoading}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 disabled:opacity-50 transition-all"
          />
          <button
            onClick={() => ask(input)}
            disabled={isLoading || !input.trim()}
            className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-xl font-medium text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
          >
            {isLoading ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>

        {messages.length > 0 && (
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Powered by Claude — responses are based on your scan data</span>
            <button
              onClick={() => { setMessages([]); setError(null); }}
              className="text-gray-400 hover:text-gray-600 underline"
            >
              Clear chat
            </button>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

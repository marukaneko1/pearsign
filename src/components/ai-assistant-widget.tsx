"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  X,
  Send,
  Loader2,
  Minimize2,
  Maximize2,
  Sparkles,
  FileText,
  Mail,
  Users,
  Zap,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: "Recent documents", icon: FileText, prompt: "Show me a summary of my recent documents and their status." },
  { label: "Pending signatures", icon: Mail, prompt: "Which documents are waiting for signatures? Who still needs to sign?" },
  { label: "My contacts", icon: Users, prompt: "List my contacts and who I've sent documents to recently." },
  { label: "Active forms", icon: Zap, prompt: "Show me my active FusionForms and their submission counts." },
];

function formatContent(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<p key={i} className="font-semibold text-sm mt-2 mb-0.5">{line.slice(4)}</p>);
    } else if (line.startsWith("## ")) {
      elements.push(<p key={i} className="font-bold text-sm mt-3 mb-1">{line.slice(3)}</p>);
    } else if (line.startsWith("# ")) {
      elements.push(<p key={i} className="font-bold text-base mt-2 mb-1">{line.slice(2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 my-0.5">
          <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-current opacity-60 translate-y-1" />
          <span className="text-sm">{line.slice(2)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 my-0.5">
            <span className="shrink-0 text-xs font-semibold opacity-60 min-w-[16px]">{match[1]}.</span>
            <span className="text-sm">{match[2]}</span>
          </div>
        );
      }
    } else if (line.trim() === "---" || line.trim() === "") {
      if (line.trim() === "---") elements.push(<hr key={i} className="my-2 border-border/50" />);
      else elements.push(<div key={i} className="h-1" />);
    } else {
      // Inline bold **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={i} className="text-sm leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [pulse, setPulse] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Subtle pulse on the button after a short delay to attract attention
  useEffect(() => {
    const t = setTimeout(() => setPulse(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowQuickActions(false);
    setStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    abortRef.current = new AbortController();

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Assistant unavailable");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + data.content }
                    : m
                )
              );
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const errorText =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: errorText }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setStreaming(false);
    setShowQuickActions(true);
  };

  return (
    <>
      {/* Floating button */}
      <div
        className={cn(
          "hidden lg:flex fixed bottom-6 right-6 z-[9998] transition-all duration-300",
          open ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        )}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Assistant"
          className={cn(
            "relative w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg",
            "flex items-center justify-center",
            "hover:scale-105 active:scale-95 transition-transform duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          <Bot className="h-6 w-6" />
          {pulse && (
            <span className="absolute inset-0 rounded-full bg-primary opacity-30 animate-ping" />
          )}
        </button>
      </div>

      {/* Chat panel */}
      <div
        className={cn(
          "hidden lg:block fixed z-[9999] transition-all duration-300 ease-out",
          "bottom-6 right-6",
          expanded
            ? "w-[520px] h-[640px]"
            : "w-[360px] h-[520px]",
          open
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-4 scale-95 pointer-events-none"
        )}
      >
        <div className="flex flex-col h-full rounded-2xl border bg-background shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-none">PearSign Assistant</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {streaming ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Thinking…
                  </span>
                ) : (
                  "Ask me anything about your documents"
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={handleReset}
                  title="New conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => setExpanded((e) => !e)}
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8 gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">How can I help you?</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                    I know your documents, contacts, and forms. Ask me anything or take an action.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 max-w-[85%] text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted rounded-tl-sm"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        msg.content ? (
                          formatContent(msg.content)
                        ) : (
                          <span className="flex gap-1 items-center py-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
                          </span>
                        )
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          {/* Quick actions */}
          {showQuickActions && messages.length === 0 && (
            <div className="px-3 pb-2 shrink-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                Quick actions
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.prompt)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-left",
                      "bg-muted/70 hover:bg-muted transition-colors",
                      "text-xs font-medium truncate"
                    )}
                  >
                    <action.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 border px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                className="border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/60"
                disabled={streaming}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className={cn(
                  "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                  input.trim() && !streaming
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed"
                )}
              >
                {streaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
              PearSign AI · press Enter to send
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

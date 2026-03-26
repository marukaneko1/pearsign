"use client";

import { cn } from "@/lib/utils";
import {
  Bot,
  FileText,
  Plus,
} from "lucide-react";

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onNewDocument?: () => void;
}

export function MobileBottomNav({ currentView, onNavigate, onNewDocument }: MobileBottomNavProps) {
  const isAIChat = currentView === "ai-generator";
  const isAgreements = currentView === "documents" || currentView === "sent" || currentView === "templates";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background border-t border-border/50"
      data-testid="mobile-bottom-nav"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
    >
      <div>
        <div className="flex items-end justify-around h-[76px] px-2 max-w-md mx-auto relative">
          <button
            data-testid="nav-ai-generator"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("ai-generator");
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 pt-2 pb-1 flex-1 min-w-0 max-w-[100px]",
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Bot
              className={cn(
                "h-6 w-6 transition-colors shrink-0",
                isAIChat ? "text-foreground stroke-[2.5px]" : "text-muted-foreground"
              )}
            />
            <span className={cn(
              "text-[11px] leading-tight truncate w-full text-center",
              isAIChat ? "text-foreground font-semibold" : "text-muted-foreground"
            )}>
              AI Chat
            </span>
          </button>

          <div className="flex flex-col items-center -mt-6 px-2 shrink-0">
            <button
              data-testid="nav-_new"
              onClick={(e) => {
                e.stopPropagation();
                onNewDocument?.();
              }}
              className="w-14 h-14 rounded-full bg-[hsl(var(--pearsign-primary))] flex items-center justify-center shadow-xl shadow-[hsl(var(--pearsign-primary))]/30"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Plus className="h-7 w-7 text-white stroke-[2.5px]" />
            </button>
          </div>

          <button
            data-testid="nav-documents"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("documents");
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 pt-2 pb-1 flex-1 min-w-0 max-w-[100px]",
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <FileText
              className={cn(
                "h-6 w-6 transition-colors shrink-0",
                isAgreements ? "text-foreground stroke-[2.5px]" : "text-muted-foreground"
              )}
            />
            <span className={cn(
              "text-[11px] leading-tight truncate w-full text-center",
              isAgreements ? "text-foreground font-semibold" : "text-muted-foreground"
            )}>
              Docs
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}

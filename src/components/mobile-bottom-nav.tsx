"use client";

import { cn } from "@/lib/utils";
import {
  Home,
  FileText,
  Plus,
} from "lucide-react";

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onNewDocument?: () => void;
}

export function MobileBottomNav({ currentView, onNavigate, onNewDocument }: MobileBottomNavProps) {
  const isHome = currentView === "dashboard";
  const isAgreements = currentView === "documents" || currentView === "sent" || currentView === "templates";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      data-testid="mobile-bottom-nav"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
    >
      <div className="bg-background border-t border-border/50">
        <div className="flex items-end justify-around h-[76px] px-6 max-w-md mx-auto relative">
          <button
            data-testid="nav-dashboard"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("dashboard");
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 pt-2 pb-1 min-w-[80px]",
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Home
              className={cn(
                "h-6 w-6 transition-colors",
                isHome ? "text-foreground stroke-[2.5px]" : "text-muted-foreground"
              )}
            />
            <span className={cn(
              "text-[11px] leading-tight",
              isHome ? "text-foreground font-semibold" : "text-muted-foreground"
            )}>
              Home
            </span>
          </button>

          <div className="flex flex-col items-center -mt-6 px-4">
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
              "flex flex-col items-center justify-center gap-1 pt-2 pb-1 min-w-[80px]",
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <FileText
              className={cn(
                "h-6 w-6 transition-colors",
                isAgreements ? "text-foreground stroke-[2.5px]" : "text-muted-foreground"
              )}
            />
            <span className={cn(
              "text-[11px] leading-tight",
              isAgreements ? "text-foreground font-semibold" : "text-muted-foreground"
            )}>
              Agreements
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}

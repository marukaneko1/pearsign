"use client";

import { useEffect, useState } from "react";
import { Send, CheckCircle, Clock, Zap, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStats {
  documentsSent: { value: number; change: number; changeLabel: string };
  completionRate: { value: number; change: number; changeLabel: string };
  pendingSignatures: { value: number; change: number; changeLabel: string };
  avgCompletionTime: { value: number; change: number; changeLabel: string };
}

interface QuickStatsProps {
  onNavigate?: (view: string) => void;
}

export function QuickStats({ onNavigate }: QuickStatsProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analytics/dashboard');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Documents Sent",
      value: loading ? "—" : String(stats?.documentsSent.value || 0),
      change: stats?.documentsSent.change || 0,
      description: stats?.documentsSent.changeLabel || "vs last month",
      icon: Send,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      navigateTo: "sent",
    },
    {
      title: "Completion Rate",
      value: loading ? "—" : `${stats?.completionRate.value || 0}%`,
      change: stats?.completionRate.change || 0,
      description: stats?.completionRate.changeLabel || "vs last month",
      icon: CheckCircle,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      navigateTo: "documents",
    },
    {
      title: "Pending Signatures",
      value: loading ? "—" : String(stats?.pendingSignatures.value || 0),
      change: stats?.pendingSignatures.change || 0,
      description: stats?.pendingSignatures.changeLabel || "awaiting action",
      icon: Clock,
      iconBg: "bg-amber-500/10 dark:bg-amber-500/15",
      iconColor: "text-amber-600 dark:text-amber-400",
      navigateTo: "sent",
    },
    {
      title: "Avg. Completion Time",
      value: loading ? "—" : (stats?.avgCompletionTime.value ? `${stats.avgCompletionTime.value}h` : "—"),
      change: stats?.avgCompletionTime.change || 0,
      description: stats?.avgCompletionTime.changeLabel || "faster than avg",
      icon: Zap,
      iconBg: "bg-violet-500/10 dark:bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
      navigateTo: "activity",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-tour="stats">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        const isPositive = stat.change >= 0;

        return (
          <button
            key={stat.title}
            onClick={() => onNavigate?.(stat.navigateTo)}
            className="rounded-md border border-border/60 bg-card p-3 sm:p-5 hover:shadow-sm hover:border-border transition-all text-left cursor-pointer mobile-touch-target"
          >
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className={cn(
                "w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0",
                stat.iconBg
              )}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Icon className={cn("h-4 w-4", stat.iconColor)} />
                )}
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground truncate">{stat.title}</span>
            </div>

            <div className="flex items-end justify-between gap-1">
              <span className={cn(
                "text-xl sm:text-2xl font-semibold tracking-tight",
                loading && "text-muted-foreground"
              )}>
                {stat.value}
              </span>

              {!loading && stat.change !== 0 && (
                <div className={cn(
                  "flex items-center gap-0.5 text-[10px] sm:text-xs font-medium shrink-0",
                  isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                )}>
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {isPositive ? "+" : ""}{stat.change}%
                </div>
              )}
            </div>

            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
              {stat.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

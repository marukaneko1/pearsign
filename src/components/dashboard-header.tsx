"use client";
import Link from "next/link";
import { useState } from "react";
import { useTheme } from "next-themes";
import { Menu, Moon, Sun, User, Settings, CreditCard, LogOut, Copy, Check, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notification-bell";
import { useTenant } from "@/contexts/tenant-context";
import { useTenantSession } from "@/contexts/tenant-session-context";

interface User {
  firstName: string;
  lastName: string;
  email: string;
}

interface DashboardHeaderProps {
  onMenuClick: () => void;
  user?: User | null;
  onLogout?: () => void;
  demoMode?: boolean;
  onToggleDemoMode?: () => void;
  onNavigate?: (path: string) => void;
  onStartTour?: () => void;
}

const AVATAR_COLOR = '#3565d4';

export function DashboardHeader({ onMenuClick, user, onLogout, demoMode, onToggleDemoMode, onNavigate, onStartTour }: DashboardHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { currentTenant, isDemo } = useTenant();
  const { session } = useTenantSession();
  const [copiedId, setCopiedId] = useState(false);

  // Get user display info - prefer user prop, then session, then demo fallback
  const sessionEmail = session?.userEmail || '';
  const sessionName = session?.userName || '';

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName}`.trim()
    : sessionName || 'Demo User';

  const displayEmail = user?.email || sessionEmail || (isDemo ? 'demo@pearsign.com' : '');

  const firstName = user?.firstName || sessionName.split(' ')[0] || '';
  const lastName = user?.lastName || sessionName.split(' ').slice(1).join(' ') || '';
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : firstName
      ? firstName.substring(0, 2).toUpperCase()
      : isDemo ? 'DU' : 'U';

  // Get account ID (tenant ID) - format it nicely for display
  const accountId = currentTenant?.id || null;
  const displayAccountId = accountId
    ? accountId.length > 20
      ? `${accountId.substring(0, 8)}...${accountId.substring(accountId.length - 6)}`
      : accountId
    : null;

  const handleCopyAccountId = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (accountId) {
      await navigator.clipboard.writeText(accountId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleProfileClick = () => {
    onNavigate?.('/settings/profile');
  };

  const handleSettingsClick = () => {
    onNavigate?.('/settings');
  };

  const handleBillingClick = () => {
    onNavigate?.('/settings/billing');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left side */}
        <div className="flex items-center gap-3">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/pearsign-logo.png" alt="PearSign" className="h-8 w-8" />
            <span className="hidden sm:inline-block text-base font-medium text-foreground">
              PearSign
            </span>
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Tutorial/Help Button */}
          {onStartTour && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={onStartTour}
              title="Getting Started Tutorial"
            >
              <HelpCircle className="h-[18px] w-[18px] text-muted-foreground hover:text-foreground transition-colors" />
              <span className="sr-only">Getting Started Tutorial</span>
            </Button>
          )}

          {/* Notifications */}
          <NotificationBell onNavigate={onNavigate} />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 w-9 rounded-full p-0 ml-1" data-tour="settings">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" alt="User" />
                  <AvatarFallback
                    className="text-white text-xs font-medium"
                    style={{ backgroundColor: AVATAR_COLOR }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {displayEmail}
                  </p>
                  {/* Account ID - Always show when tenant exists */}
                  {accountId && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Account ID
                      </span>
                      <button
                        onClick={handleCopyAccountId}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors group"
                        title="Click to copy full Account ID"
                      >
                        <code className="text-[10px] font-mono text-muted-foreground">
                          {displayAccountId}
                        </code>
                        {copiedId ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {demoMode || isDemo ? (
                <>
                  <DropdownMenuItem
                    onClick={() => window.location.href = '/login'}
                    className="text-primary font-medium"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Sign In
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.location.href = '/login'}>
                    <User className="mr-2 h-4 w-4" />
                    Create Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onClick={handleProfileClick}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSettingsClick}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBillingClick}>
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

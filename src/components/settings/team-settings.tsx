"use client";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Users,
  MoreVertical,
  Mail,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  UserPlus,
  UserMinus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  settingsApi,
  type TeamMember,
  type UserRole,
  type Team,
} from "@/lib/settings-api";

const roleColors: Record<UserRole, string> = {
  owner: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  editor: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const statusConfig = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  invited: { label: "Invited", icon: Mail, className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  deactivated: { label: "Deactivated", icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

export function TeamSettings() {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("editor");
  const [inviteTeams, setInviteTeams] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersData, teamsData] = await Promise.all([
        settingsApi.getTeamMembers(),
        settingsApi.getTeams(),
      ]);
      setMembers(membersData);
      setTeams(teamsData);
    } catch (error) {
      toast({
        title: "Error loading team",
        description: error instanceof Error ? error.message : "Failed to load team members",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRole) return;
    setIsSubmitting(true);
    try {
      await settingsApi.inviteTeamMember({
        email: inviteEmail,
        role: inviteRole,
        teams: inviteTeams,
      });
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${inviteEmail}`,
      });
      setShowInviteDialog(false);
      setInviteEmail("");
      setInviteRole("editor");
      setInviteTeams([]);
      loadData();
    } catch (error) {
      toast({
        title: "Failed to invite",
        description: error instanceof Error ? error.message : "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedMember) return;
    setIsSubmitting(true);
    try {
      await settingsApi.deactivateTeamMember(selectedMember.id);
      toast({
        title: "User deactivated",
        description: `${selectedMember.email} has been deactivated`,
      });
      setShowDeactivateDialog(false);
      setSelectedMember(null);
      await loadData();
    } catch (error) {
      toast({
        title: "Failed to deactivate",
        description: error instanceof Error ? error.message : "Failed to deactivate user",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async (member: TeamMember) => {
    try {
      await settingsApi.reactivateTeamMember(member.id);
      toast({
        title: "User reactivated",
        description: `${member.email} has been reactivated`,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Failed to reactivate",
        description: error instanceof Error ? error.message : "Failed to reactivate user",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedMember) return;
    setIsSubmitting(true);
    try {
      await settingsApi.deleteTeamMember(selectedMember.id);
      toast({
        title: "User deleted",
        description: `${selectedMember.email} has been removed from the organization`,
      });
      setShowDeleteDialog(false);
      setSelectedMember(null);
      await loadData();
    } catch (error) {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    try {
      await settingsApi.resendInvite(member.id);
      toast({
        title: "Invite resent",
        description: `A new invitation has been sent to ${member.email}`,
      });
    } catch (error) {
      toast({
        title: "Failed to resend",
        description: error instanceof Error ? error.message : "Failed to resend invitation",
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (member: TeamMember, newRole: UserRole) => {
    try {
      await settingsApi.updateTeamMember(member.id, { role: newRole });
      toast({
        title: "Role updated",
        description: `${member.email} is now ${newRole}`,
      });
      loadData();
    } catch (error) {
      toast({
        title: "Failed to update role",
        description: error instanceof Error ? error.message : "Failed to update role",
        variant: "destructive",
      });
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeAgo = (dateStr?: string) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  const activeCount = members.filter((m) => m.status === "active").length;
  const invitedCount = members.filter((m) => m.status === "invited").length;
  const deactivatedCount = members.filter((m) => m.status === "deactivated").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Members</h2>
          <p className="text-muted-foreground">
            Manage who has access to your organization
          </p>
        </div>
        <Button
          onClick={() => setShowInviteDialog(true)}
          className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{members.length}</p>
              <p className="text-xs text-muted-foreground">Total Members</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Mail className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{invitedCount}</p>
              <p className="text-xs text-muted-foreground">Pending Invite</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{deactivatedCount}</p>
              <p className="text-xs text-muted-foreground">Deactivated</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50 border-0"
          />
        </div>
        <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <Card className="overflow-hidden border-border/50">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading team members...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
              <div className="col-span-4">Member</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Last Active</div>
              <div className="col-span-2"></div>
            </div>
            <div className="divide-y">
              {filteredMembers.map((member) => {
                const status = statusConfig[member.status];
                const StatusIcon = status.icon;
                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-muted/30 transition-colors group"
                  >
                    <div className="col-span-4 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 text-white">
                          {member.firstName?.[0] || member.email[0].toUpperCase()}
                          {member.lastName?.[0] || ""}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {member.firstName && member.lastName
                            ? `${member.firstName} ${member.lastName}`
                            : member.email}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2">
                      {member.status === "active" && member.role !== "owner" ? (
                        <Select
                          value={member.role}
                          onValueChange={(value: string) => handleRoleChange(member, value as UserRole)}
                        >
                          <SelectTrigger className="h-8 w-[100px] border-0 bg-transparent p-0">
                            <Badge variant="secondary" className={cn("font-normal cursor-pointer", roleColors[member.role])}>
                              <Shield className="h-3 w-3 mr-1" />
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className={cn("font-normal", roleColors[member.role])}>
                          <Shield className="h-3 w-3 mr-1" />
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Badge variant="secondary" className={cn("gap-1.5 font-normal", status.className)}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {member.status === "invited"
                        ? `Invited ${getTimeAgo(member.invitedAt)}`
                        : getTimeAgo(member.lastActiveAt)}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {member.status === "invited" && (
                            <DropdownMenuItem onClick={() => handleResendInvite(member)}>
                              <Mail className="h-4 w-4 mr-2" />
                              Resend Invite
                            </DropdownMenuItem>
                          )}
                          {member.status === "deactivated" && (
                            <DropdownMenuItem onClick={() => handleReactivate(member)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          {member.status === "active" && member.role !== "owner" && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member);
                                setShowDeactivateDialog(true);
                              }}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {member.role !== "owner" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedMember(member);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredMembers.length === 0 && !loading && (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold mb-2">No members found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? "Try adjusting your search"
                    : "Invite team members to get started"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setShowInviteDialog(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Member
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
              Invite Team Member
            </DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={(v: string) => setInviteRole(v as UserRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("font-normal", roleColors.admin)}>Admin</Badge>
                      <span className="text-xs text-muted-foreground">Full access except billing</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("font-normal", roleColors.editor)}>Editor</Badge>
                      <span className="text-xs text-muted-foreground">Create and send documents</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("font-normal", roleColors.viewer)}>Viewer</Badge>
                      <span className="text-xs text-muted-foreground">View-only access</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Team (optional)</Label>
              <Select
                value={inviteTeams[0] || ""}
                onValueChange={(v: string) => setInviteTeams(v ? [v] : [])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.name}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail || isSubmitting}
              className="bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Deactivate User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{selectedMember?.email}</strong>?
              They will no longer be able to access the organization. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deactivating...
                </>
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete User
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Are you sure you want to permanently delete{" "}
              <strong>{selectedMember?.email}</strong> from your organization?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

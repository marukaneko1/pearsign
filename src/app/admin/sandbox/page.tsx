"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Building2,
  Users,
  FileText,
  HardDrive,
  Shield,
  Eye,
  Clock,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Activity,
  User,
  Mail,
} from "lucide-react";

interface SandboxData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    settings: Record<string, unknown>;
    billing: Record<string, unknown>;
    createdAt: string;
  };
  stats: {
    envelopes: number;
    templates: number;
    teamMembers: number;
    storageUsed: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    actor: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  teamMembers: Array<{
    id: string;
    userId: string;
    role: string;
    status: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    joinedAt?: string;
  }>;
}

function SandboxViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tenantId = searchParams.get('tenantId');

  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState('');
  const [sessionValid, setSessionValid] = useState(false);
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('admin_key');
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  useEffect(() => {
    if (!adminKey) return;

    if (token) {
      validateSession();
    } else if (tenantId) {
      loadTenantData(tenantId);
    } else {
      setError('No sandbox token or tenant ID provided');
      setLoading(false);
    }
  }, [token, tenantId, adminKey]);

  const validateSession = async () => {
    try {
      const response = await fetch(`/api/admin/sandbox?token=${token}`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid session');
        setLoading(false);
        return;
      }

      setSessionValid(true);
      setTenantName(data.session.tenantName);
      setExpiresAt(data.session.expiresAt);

      // Load tenant data
      await loadTenantData(data.session.tenantId);
    } catch (err) {
      setError('Failed to validate sandbox session');
      setLoading(false);
    }
  };

  const loadTenantData = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/sandbox?tenantId=${id}`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load tenant data');
      } else {
        setSandboxData(data);
        setTenantName(data.tenant.name);
        setSessionValid(true);
      }
    } catch (err) {
      setError('Failed to load tenant data');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    setLoading(true);
    if (sandboxData?.tenant.id) {
      loadTenantData(sandboxData.tenant.id);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getPlanBadge = (plan: string) => {
    const colors: Record<string, string> = {
      enterprise: 'bg-purple-100 text-purple-700',
      professional: 'bg-blue-100 text-blue-700',
      starter: 'bg-blue-100 text-blue-700',
      free: 'bg-gray-100 text-gray-700',
    };
    return colors[plan] || colors.free;
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-700',
      admin: 'bg-blue-100 text-blue-700',
      member: 'bg-blue-100 text-blue-700',
      viewer: 'bg-gray-100 text-gray-700',
    };
    return colors[role] || colors.viewer;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-[#2464ea] animate-spin mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading tenant environment...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Sandbox Error
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <Button onClick={() => router.push('/admin')} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sandboxData) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sandbox Header Banner */}
      <div className="bg-amber-500 text-amber-950 py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5" />
            <span className="font-semibold">
              Viewing as Tenant: {tenantName}
            </span>
            <Badge variant="outline" className="bg-amber-400 border-amber-600 text-amber-900">
              Read-Only Sandbox
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            {expiresAt && (
              <span className="text-sm flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Session expires: {formatDate(expiresAt)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="bg-amber-400 border-amber-600 hover:bg-amber-300"
              onClick={() => router.push('/admin')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Exit Sandbox
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-[#2464ea] dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {sandboxData.tenant.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={getPlanBadge(sandboxData.tenant.plan)}>
                  {sandboxData.tenant.plan}
                </Badge>
                <Badge variant={sandboxData.tenant.status === 'active' ? 'default' : 'secondary'}>
                  {sandboxData.tenant.status}
                </Badge>
                <span className="text-sm text-gray-500">
                  Slug: {sandboxData.tenant.slug}
                </span>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Envelopes</p>
                  <p className="text-2xl font-semibold">{sandboxData.stats.envelopes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Templates</p>
                  <p className="text-2xl font-semibold">{sandboxData.stats.templates}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Users className="h-6 w-6 text-[#2464ea] dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Team Members</p>
                  <p className="text-2xl font-semibold">{sandboxData.stats.teamMembers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900">
                  <HardDrive className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Storage Used</p>
                  <p className="text-2xl font-semibold">{formatBytes(sandboxData.stats.storageUsed)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Active users in this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sandboxData.teamMembers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No team members found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sandboxData.teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <User className="h-4 w-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {member.firstName} {member.lastName}
                              </p>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {member.email || member.userId}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleBadge(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                            {member.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Latest actions in this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sandboxData.recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No activity recorded</p>
              ) : (
                <div className="space-y-3">
                  {sandboxData.recentActivity.slice(0, 10).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        <Activity className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {activity.action}
                        </p>
                        <p className="text-xs text-gray-500">
                          by {activity.actor || 'Unknown'} • {activity.timestamp ? formatDate(activity.timestamp) : 'Unknown time'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tenant Details */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Tenant Configuration
            </CardTitle>
            <CardDescription>
              Settings and billing information (read-only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">Organization Info</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">ID</dt>
                    <dd className="font-mono text-xs">{sandboxData.tenant.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Created</dt>
                    <dd>{sandboxData.tenant.createdAt ? formatDate(sandboxData.tenant.createdAt) : 'Unknown'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Plan</dt>
                    <dd>{sandboxData.tenant.plan}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status</dt>
                    <dd>{sandboxData.tenant.status}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium mb-3">Billing</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Billing Status</dt>
                    <dd>{(sandboxData.tenant.billing as { status?: string })?.status || 'Not configured'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Stripe Customer</dt>
                    <dd className="font-mono text-xs">
                      {(sandboxData.tenant.billing as { customerId?: string })?.customerId || 'None'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function SandboxPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#2464ea] animate-spin" />
      </div>
    }>
      <SandboxViewContent />
    </Suspense>
  );
}

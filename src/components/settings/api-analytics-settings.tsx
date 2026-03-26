"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ApiStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByEndpoint: Record<string, number>;
  requestsByDay: { date: string; count: number }[];
}

interface ApiLog {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  createdAt: string;
}

const COLORS = [
  "hsl(var(--pearsign-primary))",
  "#2563eb",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
];

const methodColors: Record<string, string> = {
  GET: "#10b981",
  POST: "#3b82f6",
  PUT: "#f59e0b",
  PATCH: "#f97316",
  DELETE: "#ef4444",
};

export function ApiAnalyticsSettings() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch(`/api/v1/audit/stats?days=${timeRange}`),
        fetch("/api/v1/audit/api-logs?limit=50"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setRecentLogs(logsData.data || []);
      }
    } catch (error) {
      console.error("Error loading analytics:", error);
      toast({
        title: "Error loading analytics",
        description: "Failed to load API analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calculate additional metrics
  const successRate = stats
    ? stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
      : "0"
    : "0";

  const errorRate = stats
    ? stats.totalRequests > 0
      ? ((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)
      : "0"
    : "0";

  // Prepare chart data
  const dailyData = stats?.requestsByDay?.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    requests: d.count,
  })) || [];

  const endpointData = Object.entries(stats?.requestsByEndpoint || {})
    .map(([endpoint, count]) => ({
      name: endpoint.replace("/api/v1", ""),
      value: count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Calculate method distribution from recent logs
  const methodCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = { success: 0, error: 0 };
  const hourlyDistribution: Record<number, number> = {};

  recentLogs.forEach((log) => {
    methodCounts[log.method] = (methodCounts[log.method] || 0) + 1;
    if (log.statusCode >= 200 && log.statusCode < 400) {
      statusCounts.success++;
    } else {
      statusCounts.error++;
    }
    const hour = new Date(log.createdAt).getHours();
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
  });

  const methodData = Object.entries(methodCounts).map(([method, count]) => ({
    name: method,
    value: count,
    color: methodColors[method] || "#6b7280",
  }));

  const statusData = [
    { name: "Success", value: statusCounts.success, color: "#10b981" },
    { name: "Error", value: statusCounts.error, color: "#ef4444" },
  ];

  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    requests: hourlyDistribution[i] || 0,
  }));

  // Response time distribution
  const responseTimeBuckets = { fast: 0, medium: 0, slow: 0 };
  recentLogs.forEach((log) => {
    if (log.responseTime < 100) responseTimeBuckets.fast++;
    else if (log.responseTime < 500) responseTimeBuckets.medium++;
    else responseTimeBuckets.slow++;
  });

  const responseTimeData = [
    { name: "<100ms", value: responseTimeBuckets.fast, color: "#10b981" },
    { name: "100-500ms", value: responseTimeBuckets.medium, color: "#f59e0b" },
    { name: ">500ms", value: responseTimeBuckets.slow, color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Analytics</h2>
          <p className="text-muted-foreground">
            Monitor your API usage and performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[hsl(var(--pearsign-primary))]/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-3xl font-bold">{stats?.totalRequests?.toLocaleString() || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center">
                <Activity className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-sm">
              <ArrowUpRight className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-500 font-medium">12%</span>
              <span className="text-muted-foreground ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-3xl font-bold">{successRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-sm">
              <span className="text-muted-foreground">{stats?.successfulRequests?.toLocaleString() || 0} successful</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Error Rate</p>
                <p className="text-3xl font-bold">{errorRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-sm">
              <span className="text-muted-foreground">{stats?.failedRequests?.toLocaleString() || 0} failed</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Response Time</p>
                <p className="text-3xl font-bold">{Math.round(stats?.averageResponseTime || 0)}ms</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="mt-3 flex items-center text-sm">
              <ArrowDownRight className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-500 font-medium">8%</span>
              <span className="text-muted-foreground ml-1">faster</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Request Trend
            </CardTitle>
            <CardDescription>Daily API requests over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--pearsign-primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--pearsign-primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="hsl(var(--pearsign-primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRequests)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No data available</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Popular Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Popular Endpoints
            </CardTitle>
            <CardDescription>Most frequently accessed endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {endpointData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={endpointData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--pearsign-primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No data available</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Method Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              Methods
            </CardTitle>
            <CardDescription>HTTP method distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {methodData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={methodData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {methodData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">No data</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {methodData.map((m) => (
                <Badge key={m.name} variant="outline" style={{ borderColor: m.color }}>
                  <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: m.color }} />
                  {m.name}: {m.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Status
            </CardTitle>
            <CardDescription>Success vs error responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {(statusData[0].value > 0 || statusData[1].value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">No data</p>
                </div>
              )}
            </div>
            <div className="flex gap-4 justify-center mt-2">
              <Badge variant="outline" className="border-green-500">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                Success: {statusData[0].value}
              </Badge>
              <Badge variant="outline" className="border-red-500">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-1" />
                Error: {statusData[1].value}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Response Time
            </CardTitle>
            <CardDescription>Response time distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              {responseTimeData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={responseTimeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {responseTimeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">No data</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {responseTimeData.map((r) => (
                <Badge key={r.name} variant="outline" style={{ borderColor: r.color }}>
                  <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: r.color }} />
                  {r.name}: {r.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Hourly Distribution
          </CardTitle>
          <CardDescription>Request volume by hour of day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="requests" fill="hsl(var(--pearsign-primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Requests
          </CardTitle>
          <CardDescription>Latest API requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                  <th className="text-left py-2 px-3 font-medium">Method</th>
                  <th className="text-left py-2 px-3 font-medium">Endpoint</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="py-2 px-3 text-muted-foreground">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3">
                      <Badge
                        variant="outline"
                        style={{ borderColor: methodColors[log.method], color: methodColors[log.method] }}
                      >
                        {log.method}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{log.endpoint}</td>
                    <td className="py-2 px-3">
                      <Badge
                        variant={log.statusCode >= 200 && log.statusCode < 400 ? "default" : "destructive"}
                      >
                        {log.statusCode}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{log.responseTime}ms</td>
                  </tr>
                ))}
                {recentLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No API requests yet. Make some API calls to see them here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

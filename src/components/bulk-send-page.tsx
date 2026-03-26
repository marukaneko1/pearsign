"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, Clock, AlertCircle,
  Download, Users, Mail, FileText, ChevronRight, ChevronLeft, LayoutTemplate,
  Plus, Trash2, Send, Sparkles, Check, AlertTriangle, Eye, X, BarChart3,
  TrendingUp, TrendingDown, Calendar, PieChart, Target,
  Zap, PenTool, CalendarDays, Loader2, RefreshCw, Ban, ChevronDown, ChevronUp,
  MoreVertical, Bell, Search,
} from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ============== TYPES ==============

interface TemplateField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  x?: number;
  y?: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  useCount: number;
  lastUsedAt: string | null;
  fields: TemplateField[];
  hasFusionForm?: boolean;
  fusionFormUrl?: string | null;
}

interface BulkRecipient {
  id: string;
  name: string;
  email: string;
  fieldValues: Record<string, string>;
  valid: boolean;
  errors: string[];
}

interface BulkSendJob {
  id: string;
  title: string;
  templateId: string;
  templateName: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial_success";
  totalRecipients: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  customMessage: string | null;
  avgSignTimeHours: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface BulkSendStats {
  totalJobs: number;
  totalDocumentsSent: number;
  successRate: number;
  avgSignTimeHours: number;
  activeJobs: number;
  completedJobs: number;
  monthlyTrend: Array<{ month: string; sent: number; completed: number }>;
  templateUsage: Array<{ templateName: string; count: number }>;
}

interface CsvPreviewData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  fileName: string;
  mapping: Record<string, number>;
}

type Step = 'select-template' | 'add-recipients' | 'review';
type MainTab = 'send' | 'jobs' | 'analytics';
type RecipientFilter = 'all' | 'valid' | 'invalid' | 'duplicate';

// ============== HELPER: PARSE CSV ==============

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function autoMapHeaders(csvHeaders: string[], templateFields: TemplateField[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const lower = csvHeaders.map(h => h.toLowerCase().replace(/['"]/g, '').trim());

  const nameIdx = lower.findIndex(h => ['full_name', 'fullname', 'name'].includes(h));
  const firstIdx = lower.findIndex(h => ['first_name', 'firstname', 'first'].includes(h));
  const lastIdx = lower.findIndex(h => ['last_name', 'lastname', 'last'].includes(h));
  const emailIdx = lower.findIndex(h => ['email', 'email_address', 'emailaddress'].includes(h));

  if (nameIdx >= 0) mapping['full_name'] = nameIdx;
  if (firstIdx >= 0) mapping['first_name'] = firstIdx;
  if (lastIdx >= 0) mapping['last_name'] = lastIdx;
  if (emailIdx >= 0) mapping['email'] = emailIdx;

  templateFields.filter(f => f.type !== 'signature').forEach(field => {
    const key = field.name.toLowerCase().replace(/\s+/g, '_');
    const idx = lower.findIndex(h => h === key || h === field.name.toLowerCase());
    if (idx >= 0) mapping[field.id] = idx;
  });

  return mapping;
}

// ============== CSV PREVIEW COMPONENT ==============

function CsvPreviewDialog({
  preview,
  templateFields,
  onConfirm,
  onCancel,
  onUpdateMapping,
}: {
  preview: CsvPreviewData;
  templateFields: TemplateField[];
  onConfirm: () => void;
  onCancel: () => void;
  onUpdateMapping: (mapping: Record<string, number>) => void;
}) {
  const requiredTargets = [
    { key: 'name_source', label: 'Name (full_name or first+last)', required: true },
    { key: 'email', label: 'Email', required: true },
  ];

  const hasNameMapping = preview.mapping['full_name'] !== undefined ||
    (preview.mapping['first_name'] !== undefined || preview.mapping['last_name'] !== undefined);
  const hasEmailMapping = preview.mapping['email'] !== undefined;
  const nonSigFields = templateFields.filter(f => f.type !== 'signature');
  const unmappedRequired = nonSigFields.filter(f => f.required && preview.mapping[f.id] === undefined);
  const canConfirm = hasNameMapping && hasEmailMapping;

  const mappedCount = Object.keys(preview.mapping).length;
  const totalTargets = 2 + nonSigFields.length;

  const updateCol = (targetKey: string, colIdx: number) => {
    const newMapping = { ...preview.mapping };
    if (colIdx === -1) {
      delete newMapping[targetKey];
    } else {
      newMapping[targetKey] = colIdx;
    }
    onUpdateMapping(newMapping);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
            Import Preview: {preview.fileName}
          </DialogTitle>
          <DialogDescription>
            {preview.totalRows} row{preview.totalRows !== 1 ? 's' : ''} detected with {preview.headers.length} column{preview.headers.length !== 1 ? 's' : ''}.
            Map your CSV columns to the required fields below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                canConfirm ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              )}>
                {mappedCount}
              </div>
              <span className="text-sm text-muted-foreground">of {totalTargets} fields mapped</span>
            </div>
            {!hasNameMapping && <Badge variant="secondary" className="bg-red-100 text-red-700">Name not mapped</Badge>}
            {!hasEmailMapping && <Badge variant="secondary" className="bg-red-100 text-red-700">Email not mapped</Badge>}
            {unmappedRequired.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {unmappedRequired.length} required field{unmappedRequired.length !== 1 ? 's' : ''} unmapped
              </Badge>
            )}
            {canConfirm && unmappedRequired.length === 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">All required fields mapped</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Recipient Fields
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0">Full Name <span className="text-red-500">*</span></span>
                  <select
                    data-testid="select-mapping-fullname"
                    className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                    value={preview.mapping['full_name'] ?? -1}
                    onChange={(e) => updateCol('full_name', parseInt(e.target.value))}
                  >
                    <option value={-1}>-- Not mapped --</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0">First Name</span>
                  <select
                    className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                    value={preview.mapping['first_name'] ?? -1}
                    onChange={(e) => updateCol('first_name', parseInt(e.target.value))}
                  >
                    <option value={-1}>-- Not mapped --</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0">Last Name</span>
                  <select
                    className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                    value={preview.mapping['last_name'] ?? -1}
                    onChange={(e) => updateCol('last_name', parseInt(e.target.value))}
                  >
                    <option value={-1}>-- Not mapped --</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0">Email <span className="text-red-500">*</span></span>
                  <select
                    data-testid="select-mapping-email"
                    className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                    value={preview.mapping['email'] ?? -1}
                    onChange={(e) => updateCol('email', parseInt(e.target.value))}
                  >
                    <option value={-1}>-- Not mapped --</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {nonSigFields.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Template Fields
                </h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {nonSigFields.map(f => (
                    <div key={f.id} className="flex items-center gap-3">
                      <span className="text-sm w-36 shrink-0 truncate">
                        {f.name} {f.required && <span className="text-red-500">*</span>}
                      </span>
                      <select
                        className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                        value={preview.mapping[f.id] ?? -1}
                        onChange={(e) => updateCol(f.id, parseInt(e.target.value))}
                      >
                        <option value={-1}>-- Not mapped --</option>
                        {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Eye className="h-4 w-4" /> Data Preview (first {Math.min(preview.rows.length, 5)} rows)
            </h4>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                    {preview.headers.map((h, i) => {
                      const isMapped = Object.values(preview.mapping).includes(i);
                      return (
                        <th key={i} className={cn(
                          "px-3 py-2 text-left font-medium whitespace-nowrap",
                          isMapped ? "text-[hsl(var(--pearsign-primary))]" : "text-muted-foreground"
                        )}>
                          {isMapped && <Check className="h-3 w-3 inline mr-1" />}
                          {h}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      {preview.headers.map((_, j) => (
                        <td key={j} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">
                          {row[j] || <span className="text-muted-foreground/50">--</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.totalRows > 5 && (
              <p className="text-xs text-muted-foreground mt-1">... and {preview.totalRows - 5} more row{preview.totalRows - 5 !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            data-testid="button-confirm-csv-import"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="bg-[hsl(var(--pearsign-primary))]"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Import {preview.totalRows} Recipient{preview.totalRows !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== TEMPLATE PREVIEW COMPONENT ==============

function TemplatePreview({ template, onClose, onSelect }: {
  template: Template;
  onClose: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">{template.name}</h3>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Document Preview */}
            <div className="relative bg-white rounded-lg shadow-lg border aspect-[8.5/11] overflow-hidden">
              <div className="absolute inset-0 p-8">
                <div className="h-8 w-48 bg-gray-200 rounded mb-6" />
                <div className="space-y-3 mb-8">
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-5/6 bg-gray-100 rounded" />
                  <div className="h-3 w-4/5 bg-gray-100 rounded" />
                </div>
                {template.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="absolute flex items-center gap-2"
                    style={{ top: 50 + idx * 60, left: 32 }}
                  >
                    <div className={cn(
                      "px-3 py-2 rounded border-2 border-dashed text-xs font-medium",
                      field.type === 'signature' ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))]" : "border-blue-400 bg-blue-50 text-blue-600"
                    )}>
                      {field.type === 'signature' ? <PenTool className="h-3 w-3 inline mr-1" /> : null}
                      {field.name}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Field Details */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-3">Template Fields</h4>
                <div className="space-y-2">
                  {template.fields.map(field => (
                    <div key={field.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          field.type === 'signature' ? "bg-[hsl(var(--pearsign-primary))]/10" : "bg-blue-100"
                        )}>
                          {field.type === 'signature' ? <PenTool className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" /> :
                           field.type === 'date' ? <CalendarDays className="h-4 w-4 text-blue-600" /> :
                           <FileText className="h-4 w-4 text-blue-600" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{field.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{field.type}</p>
                        </div>
                      </div>
                      {field.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[hsl(var(--pearsign-primary))]/5 border border-[hsl(var(--pearsign-primary))]/20">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[hsl(var(--pearsign-primary))]" />
                  Template Stats
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Used</span><p className="font-semibold">{template.useCount} times</p></div>
                  <div><span className="text-muted-foreground">Last used</span><p className="font-semibold">{template.lastUsedAt ? new Date(template.lastUsedAt).toLocaleDateString() : 'Never'}</p></div>
                  <div><span className="text-muted-foreground">Fields</span><p className="font-semibold">{template.fields.length} mapped</p></div>
                  <div><span className="text-muted-foreground">Category</span><p className="font-semibold">{template.category}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {onSelect && (
            <Button className="bg-[hsl(var(--pearsign-primary))]" onClick={() => { onSelect(); onClose(); }}>
              <Check className="h-4 w-4 mr-2" />Use This Template
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============== ANALYTICS COMPONENT ==============

function BulkSendAnalytics({ stats, isLoading }: { stats: BulkSendStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  const templateColors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-pink-500'];
  const maxUsage = Math.max(...stats.templateUsage.map(t => t.count), 1);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <Card className="p-2.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Send className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.totalDocumentsSent}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Sent</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Target className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.successRate}%</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Rate</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Zap className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.avgSignTimeHours.toFixed(1)}h</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Avg Time</p>
            </div>
          </div>
        </Card>
        <Card className="p-2.5 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg sm:text-2xl font-bold leading-tight">{stats.totalJobs}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Jobs</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Monthly Trend</CardTitle>
            <CardDescription>Documents sent via bulk send</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.monthlyTrend.length > 0 ? stats.monthlyTrend.map((m) => (
                <div key={m.month} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{m.month}</span>
                    <span className="text-muted-foreground">{m.sent} sent</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min((m.sent / 150) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No monthly data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Template Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><PieChart className="h-4 w-4" />Template Usage</CardTitle>
            <CardDescription>Most used templates in bulk sends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.templateUsage.length > 0 ? stats.templateUsage.map((t, i) => (
                <div key={t.templateName} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{t.templateName}</span>
                    <span className="text-muted-foreground">{t.count} documents</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", templateColors[i % templateColors.length])}
                      style={{ width: `${(t.count / maxUsage) * 100}%` }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No template usage data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============== MAIN COMPONENT ==============

export function BulkSendPage() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>('send');
  const [step, setStep] = useState<Step>('select-template');

  // Data state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jobs, setJobs] = useState<BulkSendJob[]>([]);
  const [stats, setStats] = useState<BulkSendStats | null>(null);

  // Loading states
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form state
  const [showNewJob, setShowNewJob] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [recipients, setRecipients] = useState<BulkRecipient[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('all');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreviewData | null>(null);
  const [csvRawLines, setCsvRawLines] = useState<string[]>([]);

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Void state
  const [voidingJob, setVoidingJob] = useState<BulkSendJob | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobEnvelopes, setJobEnvelopes] = useState<Array<{
    id: string;
    name: string;
    status: string;
    recipientName: string;
    recipientEmail: string;
    canVoid: boolean;
  }>>([]);
  const [loadingEnvelopes, setLoadingEnvelopes] = useState(false);

  // Reminder state
  const [sendingReminders, setSendingReminders] = useState<string | null>(null);

  // Job filter state
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');
  const [jobSearch, setJobSearch] = useState('');

  // ============== DATA LOADING ==============

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/templates', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [toast]);

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const response = await fetch('/api/bulk-send', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch('/api/bulk-send/stats', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const loadJobEnvelopes = useCallback(async (jobId: string) => {
    setLoadingEnvelopes(true);
    try {
      const response = await fetch(`/api/bulk-send/${jobId}/void`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setJobEnvelopes(data.data.envelopes);
      }
    } catch (error) {
      console.error('Failed to load job envelopes:', error);
    } finally {
      setLoadingEnvelopes(false);
    }
  }, []);

  const handleVoidJob = async () => {
    if (!voidingJob || !voidReason.trim()) return;

    setIsVoiding(true);
    try {
      const response = await fetch(`/api/bulk-send/${voidingJob.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Envelopes voided',
          description: `Voided ${data.data.voidedCount} envelope(s). ${data.data.completedCount > 0 ? `${data.data.completedCount} completed envelope(s) were skipped.` : ''}`,
        });
        setVoidingJob(null);
        setVoidReason("");
        loadJobs();
        loadStats();
      } else {
        throw new Error(data.error || 'Failed to void envelopes');
      }
    } catch (error) {
      console.error('Failed to void job:', error);
      toast({
        title: 'Error',
        description: 'Failed to void envelopes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const handleVoidSingleEnvelope = async (envelopeId: string, envelopeName: string) => {
    try {
      const response = await fetch('/api/envelopes/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          envelopeId,
          reason: 'Voided from bulk send management',
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Envelope voided',
          description: `${envelopeName} has been voided`,
        });
        // Refresh the envelopes list
        if (expandedJobId) {
          loadJobEnvelopes(expandedJobId);
        }
        loadJobs();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to void envelope:', error);
      toast({
        title: 'Error',
        description: 'Failed to void envelope',
        variant: 'destructive',
      });
    }
  };

  const handleRemindAll = async (job: BulkSendJob) => {
    setSendingReminders(job.id);
    try {
      const response = await fetch(`/api/bulk-send/${job.id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Reminders sent',
          description: data.message,
        });
      } else {
        throw new Error(data.error || 'Failed to send reminders');
      }
    } catch (error) {
      console.error('Failed to send reminders:', error);
      toast({
        title: 'Error',
        description: 'Failed to send reminders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingReminders(null);
    }
  };

  const handleRemindSingleEnvelope = async (envelopeId: string, recipientEmail: string) => {
    try {
      const response = await fetch('/api/envelopes/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ envelopeId }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Reminder sent',
          description: `Reminder sent to ${recipientEmail}`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to send reminder:', error);
      toast({
        title: 'Error',
        description: 'Failed to send reminder',
        variant: 'destructive',
      });
    }
  };

  // Initialize database tables and load data on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize bulk send tables if they don't exist
        await fetch('/api/bulk-send/init', { method: 'POST', credentials: 'include' });
      } catch (error) {
        console.error('Error initializing bulk send tables:', error);
      }
    };
    init();
    loadTemplates();
    loadJobs();
    loadStats();
  }, [loadTemplates, loadJobs, loadStats]);

  // Poll for job updates when there are processing jobs
  useEffect(() => {
    const hasProcessingJobs = jobs.some(j => j.status === 'processing');

    if (hasProcessingJobs && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        loadJobs();
      }, 3000); // Poll every 3 seconds
    } else if (!hasProcessingJobs && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [jobs, loadJobs]);

  // ============== HANDLERS ==============

  const downloadCsvTemplate = () => {
    if (!selectedTemplate) return;
    // Support both full_name OR first_name + last_name
    const headers = ['full_name', 'first_name', 'last_name', 'email', ...selectedTemplate.fields.filter(f => f.type !== 'signature').map(f => f.name.toLowerCase().replace(/\s+/g, '_'))];
    const exampleRow1 = ['John Doe', '', '', 'john@example.com', ...selectedTemplate.fields.filter(f => f.type !== 'signature').map(() => 'value')];
    const exampleRow2 = ['', 'Jane', 'Smith', 'jane@example.com', ...selectedTemplate.fields.filter(f => f.type !== 'signature').map(() => 'value')];
    const csv = headers.join(',') + '\n' + exampleRow1.join(',') + '\n' + exampleRow2.join(',');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTemplate.name.toLowerCase().replace(/\s+/g, '-')}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const openCsvPreview = useCallback((content: string, fileName: string) => {
    if (!selectedTemplate) return;

    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      toast({
        title: 'Invalid CSV',
        description: 'CSV must have a header row and at least one data row',
        variant: 'destructive',
      });
      return;
    }

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/['"]/g, '').trim());
    const rows = lines.slice(1).map(line => parseCSVLine(line).map(v => v.replace(/['"]/g, '').trim())).filter(row => !row.every(v => !v));

    if (rows.length === 0) {
      toast({ title: 'No data rows', description: 'CSV has no data rows', variant: 'destructive' });
      return;
    }

    const mapping = autoMapHeaders(headers, selectedTemplate.fields);
    setCsvRawLines(lines);
    setCsvPreview({ headers, rows, totalRows: rows.length, fileName, mapping });
  }, [selectedTemplate, toast]);

  const commitCsvImport = useCallback(() => {
    if (!csvPreview || !selectedTemplate) return;
    const { mapping, rows } = csvPreview;

    const parsed: BulkRecipient[] = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i];

      let name = '';
      if (mapping['full_name'] !== undefined && values[mapping['full_name']]) {
        name = values[mapping['full_name']];
      } else {
        const first = mapping['first_name'] !== undefined ? values[mapping['first_name']] || '' : '';
        const last = mapping['last_name'] !== undefined ? values[mapping['last_name']] || '' : '';
        name = `${first} ${last}`.trim();
      }

      const email = mapping['email'] !== undefined ? values[mapping['email']] || '' : '';

      const errors: string[] = [];
      if (!name) errors.push('Name required');
      if (!email) errors.push('Email required');
      if (email && !email.includes('@')) errors.push('Invalid email format');

      const emailLower = email.toLowerCase();
      if (emailLower && seenEmails.has(emailLower)) {
        errors.push('Duplicate email');
      }
      if (emailLower) seenEmails.add(emailLower);

      const fieldValues: Record<string, string> = {};
      selectedTemplate.fields.filter(f => f.type !== 'signature').forEach(field => {
        fieldValues[field.id] = mapping[field.id] !== undefined && values[mapping[field.id]] ? values[mapping[field.id]] : '';
        if (field.required && !fieldValues[field.id]) {
          errors.push(`${field.name} required`);
        }
      });

      parsed.push({
        id: `r-${i + 1}`,
        name,
        email,
        fieldValues,
        valid: errors.length === 0,
        errors,
      });
    }

    setRecipients(parsed);
    setCsvPreview(null);
    setCsvRawLines([]);

    const vCount = parsed.filter(r => r.valid).length;
    const iCount = parsed.filter(r => !r.valid).length;
    toast({
      title: 'CSV imported',
      description: `${vCount} valid, ${iCount} invalid recipient${iCount !== 1 ? 's' : ''} found`,
    });
  }, [csvPreview, selectedTemplate, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (ev) => openCsvPreview(ev.target?.result as string, file.name);
      reader.readAsText(file);
    }
  }, [openCsvPreview]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => openCsvPreview(ev.target?.result as string, file.name);
      reader.readAsText(file);
    }
  };

  const addManualRecipient = () => {
    const fieldValues: Record<string, string> = {};
    selectedTemplate?.fields.filter(f => f.type !== 'signature').forEach(f => fieldValues[f.id] = '');
    setRecipients([...recipients, { id: `r-${Date.now()}`, name: '', email: '', fieldValues, valid: false, errors: ['Name required', 'Email required'] }]);
  };

  const updateRecipient = (id: string, field: string, value: string) => {
    setRecipients(recipients.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r };
      if (field === 'name') updated.name = value;
      else if (field === 'email') updated.email = value;
      else updated.fieldValues = { ...r.fieldValues, [field]: value };
      const errors: string[] = [];
      if (!updated.name) errors.push('Name required');
      if (!updated.email || !updated.email.includes('@')) errors.push('Valid email required');
      selectedTemplate?.fields.filter(f => f.type !== 'signature').forEach(f => {
        if (f.required && !updated.fieldValues[f.id]) errors.push(`${f.name} required`);
      });
      updated.errors = errors;
      updated.valid = errors.length === 0;
      return updated;
    }));
  };

  const removeRecipient = (id: string) => setRecipients(recipients.filter(r => r.id !== id));

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setJobTitle(`${template.name} - Bulk Send`);
    setRecipients([]);
    setStep('add-recipients');
  };

  const handleStartBulkSend = async () => {
    if (!selectedTemplate || recipients.filter(r => r.valid).length === 0) return;

    setIsProcessing(true);
    try {
      const validRecipients = recipients.filter(r => r.valid);

      const response = await fetch('/api/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: jobTitle,
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          customMessage: customMessage || undefined,
          recipients: validRecipients.map(r => ({
            name: r.name,
            email: r.email,
            fieldValues: r.fieldValues,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Bulk send started',
          description: `Sending ${validRecipients.length} documents using "${selectedTemplate.name}"`,
        });

        // Refresh jobs list
        await loadJobs();
        await loadStats();

        // Reset form
        setShowNewJob(false);
        setStep('select-template');
        setSelectedTemplate(null);
        setRecipients([]);
        setJobTitle('');
        setCustomMessage('');
        setMainTab('jobs');
      } else {
        throw new Error(data.error || 'Failed to start bulk send');
      }
    } catch (error) {
      console.error('Failed to start bulk send:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start bulk send',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: BulkSendJob["status"]) => {
    const configs = {
      pending: { bg: "bg-gray-100", text: "text-gray-700", icon: Clock },
      processing: { bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
      completed: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2 },
      partial_success: { bg: "bg-yellow-100", text: "text-yellow-700", icon: AlertCircle },
      failed: { bg: "bg-red-100", text: "text-red-700", icon: XCircle }
    };
    const c = configs[status];
    return (
      <Badge variant="secondary" className={`${c.bg} ${c.text}`}>
        <c.icon className={cn("w-3 h-3 mr-1", status === "processing" && "animate-spin")} />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const validCount = recipients.filter(r => r.valid).length;
  const invalidCount = recipients.filter(r => !r.valid).length;
  const duplicateCount = recipients.filter(r => r.errors.some(e => e.includes('Duplicate'))).length;

  const filteredRecipients = recipients.filter(r => {
    if (recipientFilter === 'valid' && !r.valid) return false;
    if (recipientFilter === 'invalid' && r.valid) return false;
    if (recipientFilter === 'duplicate' && !r.errors.some(e => e.includes('Duplicate'))) return false;
    if (recipientSearch) {
      const s = recipientSearch.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    }
    return true;
  });

  const removeInvalidRecipients = () => {
    setRecipients(recipients.filter(r => r.valid));
    setRecipientFilter('all');
    toast({ title: 'Cleaned up', description: `Removed ${invalidCount} invalid recipient${invalidCount !== 1 ? 's' : ''}` });
  };

  const removeDuplicates = () => {
    const seen = new Set<string>();
    const deduped = recipients.filter(r => {
      const key = r.email.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = recipients.length - deduped.length;
    const revalidated = deduped.map(r => {
      const errors = r.errors.filter(e => !e.includes('Duplicate'));
      return { ...r, errors, valid: errors.length === 0 };
    });
    setRecipients(revalidated);
    setRecipientFilter('all');
    toast({ title: 'Duplicates removed', description: `Removed ${removed} duplicate recipient${removed !== 1 ? 's' : ''}` });
  };

  const exportInvalidCsv = () => {
    if (!selectedTemplate) return;
    const invalidRecipients = recipients.filter(r => !r.valid);
    if (invalidRecipients.length === 0) return;
    const nonSigFields = selectedTemplate.fields.filter(f => f.type !== 'signature');
    const headers = ['name', 'email', ...nonSigFields.map(f => f.name.toLowerCase().replace(/\s+/g, '_')), 'errors'];
    const rows = invalidRecipients.map(r => [
      r.name, r.email,
      ...nonSigFields.map(f => r.fieldValues[f.id] || ''),
      r.errors.join('; ')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = 'invalid-recipients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredJobs = jobs.filter(j => {
    if (jobStatusFilter !== 'all' && j.status !== jobStatusFilter) return false;
    if (jobSearch) {
      const s = jobSearch.toLowerCase();
      return j.title.toLowerCase().includes(s) || j.templateName.toLowerCase().includes(s);
    }
    return true;
  });

  // ============== RENDER ==============

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Template Preview Modal */}
      {previewTemplate && (
        <TemplatePreview
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onSelect={() => handleSelectTemplate(previewTemplate)}
        />
      )}

      {/* CSV Preview Dialog */}
      {csvPreview && selectedTemplate && (
        <CsvPreviewDialog
          preview={csvPreview}
          templateFields={selectedTemplate.fields}
          onConfirm={commitCsvImport}
          onCancel={() => { setCsvPreview(null); setCsvRawLines([]); }}
          onUpdateMapping={(mapping) => setCsvPreview(prev => prev ? { ...prev, mapping } : null)}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight">Bulk Send</h2>
          <p className="text-xs sm:text-base text-muted-foreground">Send pre-mapped templates to multiple recipients</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadJobs(); loadStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {!showNewJob && (
            <Button onClick={() => { setShowNewJob(true); setMainTab('send'); }} className="bg-[hsl(var(--pearsign-primary))]">
              <Send className="w-4 h-4 mr-2" />New Bulk Send
            </Button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="send" className="flex items-center gap-2"><Send className="h-4 w-4" />Send</TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Jobs</TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            {[
              { label: "Jobs", value: jobs.length, icon: FileSpreadsheet, bg: "bg-primary/10", color: "text-primary" },
              { label: "Sent", value: jobs.reduce((a, j) => a + j.successCount, 0), icon: Mail, bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600 dark:text-blue-400" },
              { label: "Rate", value: `${jobs.length ? Math.round((jobs.reduce((a, j) => a + j.successCount, 0) / Math.max(1, jobs.reduce((a, j) => a + j.totalRecipients, 0))) * 100) : 0}%`, icon: CheckCircle2, bg: "bg-green-100 dark:bg-green-900/30", color: "text-green-600 dark:text-green-400" },
              { label: "Active", value: jobs.filter(j => j.status === "processing").length, icon: Clock, bg: "bg-amber-100 dark:bg-amber-900/30", color: "text-amber-600 dark:text-amber-400" }
            ].map((stat, i) => (
              <Card key={i} className="p-2.5 sm:p-5">
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-4">
                  <div className={cn("w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
                    <stat.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5", stat.color)} />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-lg sm:text-2xl font-bold leading-tight">{stat.value}</p>
                    <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {showNewJob && (
            <Card className="border-[hsl(var(--pearsign-primary))]/30">
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 py-4 bg-muted/30 border-b">
                {[
                  { key: 'select-template', label: 'Select Template', icon: LayoutTemplate },
                  { key: 'add-recipients', label: 'Add Recipients', icon: Users },
                  { key: 'review', label: 'Review & Send', icon: Send }
                ].map((s, i, arr) => {
                  const order = ['select-template', 'add-recipients', 'review'];
                  const isActive = step === s.key;
                  const isCompleted = order.indexOf(step) > order.indexOf(s.key);
                  return (
                    <div key={s.key} className="flex items-center">
                      <div className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full",
                        isActive && "bg-[hsl(var(--pearsign-primary))] text-white",
                        isCompleted && "bg-[hsl(var(--pearsign-primary))]/20 text-[hsl(var(--pearsign-primary))]",
                        !isActive && !isCompleted && "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                        <span className="text-sm font-medium hidden md:inline">{s.label}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div className={cn("w-8 h-0.5 mx-2", isCompleted ? "bg-[hsl(var(--pearsign-primary))]" : "bg-muted")} />
                      )}
                    </div>
                  );
                })}
              </div>

              <CardContent className="p-6">
                {/* Step 1: Select Template */}
                {step === 'select-template' && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-semibold mb-2">Choose a Template</h3>
                      <p className="text-muted-foreground">Select a pre-mapped template - fields are already configured</p>
                    </div>

                    {isLoadingTemplates ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">No templates available</p>
                        <p className="text-sm text-muted-foreground">Create templates first to use bulk send</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.map(t => (
                          <div key={t.id} className="p-5 rounded-xl border-2 transition-all hover:shadow-lg hover:border-[hsl(var(--pearsign-primary))]/50 group">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
                                <FileText className="h-6 w-6 text-[hsl(var(--pearsign-primary))]" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-semibold">{t.name}</h4>
                                  <Badge variant="secondary">{t.category}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-3">{t.description}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                                  <span><Sparkles className="h-3 w-3 inline mr-1" />{t.fields.length} fields</span>
                                  <span>Used {t.useCount}x</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(t)}>
                                    <Eye className="h-4 w-4 mr-1" />Preview
                                  </Button>
                                  <Button size="sm" onClick={() => handleSelectTemplate(t)} className="bg-[hsl(var(--pearsign-primary))]">
                                    Select<ChevronRight className="h-4 w-4 ml-1" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setShowNewJob(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Add Recipients */}
                {step === 'add-recipients' && selectedTemplate && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h3 className="text-xl font-semibold">Add Recipients</h3>
                        <p className="text-sm text-muted-foreground">Template: <span className="font-medium">{selectedTemplate.name}</span></p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(selectedTemplate)}>
                          <Eye className="h-4 w-4 mr-2" />Preview
                        </Button>
                        <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                          <Download className="h-4 w-4 mr-2" />Download CSV Template
                        </Button>
                      </div>
                    </div>

                    {/* Upload Section */}
                    <div className="flex gap-4 items-start">
                      <div
                        className={cn(
                          "flex-1 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                          dragActive ? "border-[hsl(var(--pearsign-primary))] bg-[hsl(var(--pearsign-primary))]/5" : "hover:border-[hsl(var(--pearsign-primary))]/50 hover:bg-muted/30"
                        )}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('csv-upload')?.click()}
                      >
                        <input type="file" id="csv-upload" className="hidden" accept=".csv" onChange={handleFileSelect} />
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center mb-3">
                          <FileSpreadsheet className="h-7 w-7 text-[hsl(var(--pearsign-primary))]" />
                        </div>
                        <p className="font-medium text-sm mb-1">Drop your CSV file here or click to browse</p>
                        <p className="text-xs text-muted-foreground">
                          Columns are auto-mapped. Supports full_name or first_name + last_name, email, and template fields.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" size="sm" onClick={addManualRecipient} data-testid="button-add-manual-recipient">
                          <Plus className="h-4 w-4 mr-1" />Add Manually
                        </Button>
                      </div>
                    </div>

                    {/* Recipient Toolbar */}
                    {recipients.length > 0 && (
                      <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex rounded-lg border overflow-hidden">
                            {[
                              { key: 'all' as RecipientFilter, label: 'All', count: recipients.length },
                              { key: 'valid' as RecipientFilter, label: 'Valid', count: validCount },
                              { key: 'invalid' as RecipientFilter, label: 'Invalid', count: invalidCount },
                              ...(duplicateCount > 0 ? [{ key: 'duplicate' as RecipientFilter, label: 'Duplicates', count: duplicateCount }] : []),
                            ].map(f => (
                              <button
                                key={f.key}
                                data-testid={`button-filter-${f.key}`}
                                className={cn(
                                  "px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0",
                                  recipientFilter === f.key ? "bg-[hsl(var(--pearsign-primary))] text-white" : "hover:bg-muted"
                                )}
                                onClick={() => setRecipientFilter(f.key)}
                              >
                                {f.label} ({f.count})
                              </button>
                            ))}
                          </div>
                          <div className="relative">
                            <Input
                              placeholder="Search recipients..."
                              value={recipientSearch}
                              onChange={e => setRecipientSearch(e.target.value)}
                              className="h-8 w-48 pl-8 text-sm"
                              data-testid="input-search-recipients"
                            />
                            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {duplicateCount > 0 && (
                            <Button variant="outline" size="sm" onClick={removeDuplicates} data-testid="button-remove-duplicates">
                              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-500" />Remove Duplicates
                            </Button>
                          )}
                          {invalidCount > 0 && (
                            <>
                              <Button variant="outline" size="sm" onClick={exportInvalidCsv}>
                                <Download className="h-3.5 w-3.5 mr-1" />Export Invalid
                              </Button>
                              <Button variant="outline" size="sm" onClick={removeInvalidRecipients} className="text-red-600 border-red-200 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5 mr-1" />Remove Invalid
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { setRecipients([]); setRecipientFilter('all'); setRecipientSearch(''); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" />Clear All
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Recipients Table */}
                    {recipients.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        {/* Table Header */}
                        <div className="bg-muted/50 px-4 py-3 border-b">
                          <div className="grid gap-3" style={{ gridTemplateColumns: `40px 50px 1fr 1fr ${selectedTemplate.fields.filter(f => f.type !== 'signature').map(() => '1fr').join(' ')} 40px` }}>
                            <span className="text-xs font-medium text-muted-foreground">#</span>
                            <span className="text-xs font-medium text-muted-foreground">Status</span>
                            <span className="text-xs font-medium text-muted-foreground">Full Name *</span>
                            <span className="text-xs font-medium text-muted-foreground">Email *</span>
                            {selectedTemplate.fields.filter(f => f.type !== 'signature').map(f => (
                              <span key={f.id} className="text-xs font-medium text-muted-foreground">{f.name}{f.required ? ' *' : ''}</span>
                            ))}
                            <span></span>
                          </div>
                        </div>

                        {/* Table Body */}
                        <div className="max-h-[280px] overflow-y-auto">
                          {filteredRecipients.length === 0 ? (
                            <div className="text-center py-8 text-sm text-muted-foreground">No recipients match the current filter</div>
                          ) : filteredRecipients.map((r, i) => (
                            <div
                              key={r.id}
                              className={cn(
                                "px-4 py-2 border-b last:border-b-0 transition-colors",
                                r.valid ? "bg-green-50/30 hover:bg-green-50/50" : "bg-red-50/30 hover:bg-red-50/50"
                              )}
                            >
                              <div className="grid gap-3 items-center" style={{ gridTemplateColumns: `40px 50px 1fr 1fr ${selectedTemplate.fields.filter(f => f.type !== 'signature').map(() => '1fr').join(' ')} 40px` }}>
                                <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
                                <div>
                                  {r.valid ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <div className="relative group">
                                      <AlertTriangle className="h-4 w-4 text-red-500 cursor-help" />
                                      <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block bg-red-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                        {r.errors.join(', ')}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <Input
                                  placeholder="Full Name"
                                  value={r.name}
                                  onChange={e => updateRecipient(r.id, 'name', e.target.value)}
                                  className="h-8 text-sm bg-background border-border"
                                />
                                <Input
                                  placeholder="email@example.com"
                                  type="email"
                                  value={r.email}
                                  onChange={e => updateRecipient(r.id, 'email', e.target.value)}
                                  className="h-8 text-sm bg-background border-border"
                                />
                                {selectedTemplate.fields.filter(f => f.type !== 'signature').map(f => (
                                  <Input
                                    key={f.id}
                                    placeholder={f.name}
                                    value={r.fieldValues[f.id] || ''}
                                    onChange={e => updateRecipient(r.id, f.id, e.target.value)}
                                    className="h-8 text-sm bg-background border-border"
                                  />
                                ))}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                  onClick={() => removeRecipient(r.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {recipients.length === 0 && (
                      <div className="p-12 text-center border-2 border-dashed rounded-xl">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-muted-foreground font-medium">No recipients added yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Upload a CSV file or add recipients manually</p>
                      </div>
                    )}

                    {recipients.length > 0 && (
                      <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg">
                        <span className="text-green-600 font-medium">
                          <CheckCircle2 className="h-4 w-4 inline mr-1" />{validCount} valid
                        </span>
                        {invalidCount > 0 && (
                          <span className="text-red-600">
                            <XCircle className="h-4 w-4 inline mr-1" />{invalidCount} invalid
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setStep('select-template')}>
                        <ChevronLeft className="h-4 w-4 mr-2" />Back
                      </Button>
                      <Button disabled={validCount === 0} onClick={() => setStep('review')} className="bg-[hsl(var(--pearsign-primary))]">
                        Continue<ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Review & Send */}
                {step === 'review' && selectedTemplate && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-xl font-semibold mb-2">Review & Send</h3>
                      <p className="text-sm text-muted-foreground">Confirm the details below before sending</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--pearsign-primary))]/10 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
                          </div>
                          <h4 className="font-semibold">Template</h4>
                        </div>
                        <p className="font-medium">{selectedTemplate.name}</p>
                        <p className="text-sm text-muted-foreground">{selectedTemplate.fields.length} fields configured</p>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                            <Users className="h-5 w-5 text-green-600" />
                          </div>
                          <h4 className="font-semibold">Recipients</h4>
                        </div>
                        <p className="text-3xl font-bold text-green-600">{validCount}</p>
                        <p className="text-sm text-muted-foreground">documents will be sent</p>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-blue-600" />
                          </div>
                          <h4 className="font-semibold">Delivery</h4>
                        </div>
                        <p className="font-medium">Email</p>
                        <p className="text-sm text-muted-foreground">via SendGrid</p>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Job Title</Label>
                        <Input
                          value={jobTitle}
                          onChange={e => setJobTitle(e.target.value)}
                          className="mt-2"
                          placeholder="e.g., Q1 Contract Distribution"
                          data-testid="input-job-title"
                        />
                      </div>
                      <div>
                        <Label>Custom Message (optional)</Label>
                        <Textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} className="mt-2" rows={3} placeholder="Add a personalized message for recipients..." />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" /> Recipient Preview
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-4 py-2 border-b grid grid-cols-[2fr_3fr] gap-3">
                          <span className="text-xs font-medium text-muted-foreground">Name</span>
                          <span className="text-xs font-medium text-muted-foreground">Email</span>
                        </div>
                        <div className="max-h-[160px] overflow-y-auto">
                          {recipients.filter(r => r.valid).slice(0, 20).map((r, i) => (
                            <div key={r.id} className="px-4 py-2 border-b last:border-b-0 grid grid-cols-[2fr_3fr] gap-3 text-sm">
                              <span className="truncate">{r.name}</span>
                              <span className="truncate text-muted-foreground">{r.email}</span>
                            </div>
                          ))}
                          {validCount > 20 && (
                            <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                              ... and {validCount - 20} more recipient{validCount - 20 !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {invalidCount > 0 && (
                      <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800">{invalidCount} invalid recipient{invalidCount !== 1 ? 's' : ''} will be skipped</p>
                          <p className="text-xs text-amber-600">Go back to fix or remove them</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setStep('add-recipients')}>Fix</Button>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setStep('add-recipients')}>
                        <ChevronLeft className="h-4 w-4 mr-2" />Back
                      </Button>
                      <Button disabled={isProcessing} onClick={handleStartBulkSend} className="bg-[hsl(var(--pearsign-primary))]" data-testid="button-send-bulk">
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Send to {validCount} Recipient{validCount !== 1 ? 's' : ''}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!showNewJob && (
            <Card className="p-12 text-center border-dashed">
              <Send className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Start a Bulk Send</h3>
              <p className="text-muted-foreground mb-4">Select a template and add recipients to send documents in bulk</p>
              <Button onClick={() => setShowNewJob(true)} className="bg-[hsl(var(--pearsign-primary))]">
                <Send className="h-4 w-4 mr-2" />New Bulk Send
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>Bulk Send Jobs</CardTitle>
                  <CardDescription>Track your bulk send operations</CardDescription>
                </div>
                {jobs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Input
                        placeholder="Search jobs..."
                        value={jobSearch}
                        onChange={e => setJobSearch(e.target.value)}
                        className="h-8 w-48 pl-8 text-sm"
                        data-testid="input-search-jobs"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <select
                      className="h-8 rounded-md border bg-background px-3 text-sm"
                      value={jobStatusFilter}
                      onChange={e => setJobStatusFilter(e.target.value)}
                      data-testid="select-job-status-filter"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                      <option value="partial_success">Partial</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingJobs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12">
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">No jobs yet</p>
                  <p className="text-sm text-muted-foreground">Start a bulk send to see jobs here</p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">No matching jobs</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or filter</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredJobs.map(job => {
                    const isExpanded = expandedJobId === job.id;
                    const canVoid = job.status === 'completed' || job.status === 'partial_success' || job.status === 'processing';

                    return (
                      <div key={job.id} className="border rounded-lg overflow-hidden">
                        <div className="p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex justify-between mb-3">
                            <div className="flex items-start gap-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => {
                                  if (isExpanded) {
                                    setExpandedJobId(null);
                                    setJobEnvelopes([]);
                                  } else {
                                    setExpandedJobId(job.id);
                                    loadJobEnvelopes(job.id);
                                  }
                                }}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                              <div>
                                <h3 className="font-semibold">{job.title}</h3>
                                <p className="text-sm text-muted-foreground">Template: {job.templateName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(job.status)}
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {(job.status === 'completed' || job.status === 'partial_success' || job.status === 'processing') && (
                                      <DropdownMenuItem
                                        onClick={() => handleRemindAll(job)}
                                        disabled={sendingReminders === job.id}
                                      >
                                        {sendingReminders === job.id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <Bell className="mr-2 h-4 w-4" />
                                        )}
                                        Remind All Pending
                                      </DropdownMenuItem>
                                    )}
                                    {job.failedCount > 0 && (job.status === 'completed' || job.status === 'partial_success' || job.status === 'failed') && (
                                      <DropdownMenuItem
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/api/bulk-send/${job.id}/retry`, { method: 'POST' });
                                            const data = await res.json();
                                            if (data.success) {
                                              toast({ title: 'Retrying', description: `Retrying ${data.data.retriedCount} failed recipient${data.data.retriedCount !== 1 ? 's' : ''}` });
                                              loadJobs();
                                            } else {
                                              toast({ title: 'Error', description: data.error, variant: 'destructive' });
                                            }
                                          } catch {
                                            toast({ title: 'Error', description: 'Failed to retry', variant: 'destructive' });
                                          }
                                        }}
                                        data-testid={`button-retry-job-${job.id}`}
                                      >
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Retry Failed ({job.failedCount})
                                      </DropdownMenuItem>
                                    )}
                                    {canVoid && (
                                      <DropdownMenuItem
                                        className="text-red-600"
                                        onClick={() => setVoidingJob(job)}
                                      >
                                        <Ban className="mr-2 h-4 w-4" />
                                        Void All Envelopes
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                          </div>
                          <div className="flex gap-4 text-sm ml-11">
                            <span><Users className="w-4 h-4 inline mr-1" />{job.totalRecipients}</span>
                            <span className="text-green-600"><CheckCircle2 className="w-4 h-4 inline mr-1" />{job.successCount}</span>
                            {job.failedCount > 0 && (
                              <span className="text-red-600"><XCircle className="w-4 h-4 inline mr-1" />{job.failedCount}</span>
                            )}
                            <span className="text-muted-foreground ml-auto">
                              <Calendar className="w-4 h-4 inline mr-1" />
                              {new Date(job.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {job.status === "processing" && (
                            <Progress value={(job.processedCount / job.totalRecipients) * 100} className="h-2 mt-3 ml-11" />
                          )}
                        </div>

                        {/* Expanded Envelopes List */}
                        {isExpanded && (
                          <div className="border-t bg-muted/20">
                            {loadingEnvelopes ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : jobEnvelopes.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground text-sm">
                                No envelopes found for this job
                              </div>
                            ) : (
                              <div className="divide-y max-h-[300px] overflow-y-auto">
                                {jobEnvelopes.map((envelope) => (
                                  <div key={envelope.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/50">
                                    <div className="flex items-center gap-3">
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        envelope.status === 'completed' ? 'bg-green-500' :
                                        envelope.status === 'voided' ? 'bg-red-500' :
                                        envelope.status === 'in_signing' ? 'bg-amber-500' :
                                        'bg-gray-400'
                                      )} />
                                      <div>
                                        <p className="text-sm font-medium">{envelope.recipientName}</p>
                                        <p className="text-xs text-muted-foreground">{envelope.recipientEmail}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className={cn(
                                        "text-xs",
                                        envelope.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        envelope.status === 'voided' ? 'bg-red-100 text-red-700' :
                                        envelope.status === 'in_signing' ? 'bg-amber-100 text-amber-700' :
                                        ''
                                      )}>
                                        {envelope.status === 'in_signing' ? 'Pending' : envelope.status}
                                      </Badge>
                                      {envelope.canVoid && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            onClick={() => handleRemindSingleEnvelope(envelope.id, envelope.recipientEmail)}
                                          >
                                            <Bell className="h-3 w-3 mr-1" />
                                            Remind
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleVoidSingleEnvelope(envelope.id, envelope.name)}
                                          >
                                            <Ban className="h-3 w-3 mr-1" />
                                            Void
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <BulkSendAnalytics stats={stats} isLoading={isLoadingStats} />
        </TabsContent>
      </Tabs>

      {/* Void All Envelopes Confirmation Dialog */}
      <Dialog open={!!voidingJob} onOpenChange={(open) => { if (!open) { setVoidingJob(null); setVoidReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Void All Envelopes
            </DialogTitle>
            <DialogDescription>
              This will void all pending envelopes from this bulk send job. Already completed envelopes cannot be voided.
            </DialogDescription>
          </DialogHeader>

          {voidingJob && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{voidingJob.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {voidingJob.totalRecipients} recipient{voidingJob.totalRecipients !== 1 ? 's' : ''} • Template: {voidingJob.templateName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-reason">Reason for voiding (required)</Label>
                <Textarea
                  id="void-reason"
                  placeholder="Enter the reason for voiding these envelopes..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Warning</p>
                    <p className="text-amber-700">This action cannot be undone. Recipients will be notified that their signing request has been cancelled.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoidingJob(null); setVoidReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidJob}
              disabled={!voidReason.trim() || isVoiding}
            >
              {isVoiding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Void All Envelopes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

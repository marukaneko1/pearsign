"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Send,
  Download,
  DollarSign,
  Copy,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  FileText,
  PenLine,
  Ban,
  CreditCard,
  Link2,
  ExternalLink,
  Receipt,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Hash,
  Pencil,
  History,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  amount?: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_zip?: string | null;
  customer_country?: string | null;
  line_items: LineItem[];
  subtotal?: number;
  tax_total?: number;
  discount_type?: string | null;
  discount_value?: number;
  discount_total?: number;
  total: number;
  amount_paid: number;
  currency: string;
  issue_date: string;
  due_date: string;
  memo?: string | null;
  terms?: string | null;
  po_number?: string | null;
  notes_internal?: string | null;
  require_signature?: boolean;
  require_signature_before_payment?: boolean;
  signed_at?: string | null;
  signature_envelope_id?: string | null;
  payment_history?: PaymentRecord[];
  created_at: string;
  updated_at?: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
}

interface PaymentRecord {
  id: string;
  amount: number;
  method?: string;
  reference?: string;
  transaction_ref?: string;
  date?: string;
  recorded_at?: string;
  recorded_by?: string;
}

interface AuditLog {
  id: string;
  action: string;
  actor_type: string;
  actor_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType; borderColor: string }> = {
  draft: { label: "Draft", color: "text-muted-foreground", bgColor: "bg-muted", borderColor: "border-muted-foreground/20", icon: FileText },
  sent: { label: "Sent", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", icon: Send },
  viewed: { label: "Viewed", color: "text-sky-600 dark:text-sky-400", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/30", icon: Eye },
  signed: { label: "Signed", color: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/30", icon: PenLine },
  partially_paid: { label: "Partially Paid", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30", icon: CreditCard },
  paid: { label: "Paid", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: CheckCircle2 },
  overdue: { label: "Overdue", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", icon: AlertTriangle },
  void: { label: "Void", color: "text-muted-foreground", bgColor: "bg-muted", borderColor: "border-muted-foreground/20", icon: Ban },
};

const AUDIT_ACTION_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  invoice_created: { label: "Invoice created", icon: Plus, color: "text-blue-500" },
  invoice_updated: { label: "Invoice updated", icon: Pencil, color: "text-amber-500" },
  invoice_sent: { label: "Invoice sent", icon: Send, color: "text-sky-500" },
  invoice_viewed: { label: "Viewed by customer", icon: Eye, color: "text-violet-500" },
  invoice_signed: { label: "Signed by customer", icon: PenLine, color: "text-emerald-500" },
  invoice_paid: { label: "Payment received", icon: CheckCircle2, color: "text-emerald-500" },
  invoice_partially_paid: { label: "Partial payment", icon: CreditCard, color: "text-orange-500" },
  invoice_voided: { label: "Invoice voided", icon: Ban, color: "text-red-500" },
  payment_link_generated: { label: "Payment link created", icon: Link2, color: "text-blue-500" },
  reminder_sent: { label: "Reminder sent", icon: Mail, color: "text-amber-500" },
  signature_requested: { label: "Signature requested", icon: PenLine, color: "text-violet-500" },
};

interface InvoiceDetailViewProps {
  invoiceId: string;
  onBack: () => void;
  onEdit: (invoice: Invoice) => void;
  onRefresh: () => void;
}

export function InvoiceDetailView({ invoiceId, onBack, onEdit, onRefresh }: InvoiceDetailViewProps) {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "payments" | "activity">("details");

  const fetchInvoice = useCallback(async () => {
    try {
      setLoading(true);
      const [invRes, auditRes] = await Promise.all([
        fetch(`/api/invoices/${invoiceId}`),
        fetch(`/api/invoices/${invoiceId}/audit`).catch(() => null),
      ]);

      if (invRes.ok) {
        const data = await invRes.json();
        setInvoice(data);
      }

      if (auditRes?.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData.logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch invoice:", error);
      toast({ title: "Error", description: "Failed to load invoice details.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [invoiceId, toast]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const isOverdue = invoice && !["paid", "void"].includes(invoice.status) && new Date(invoice.due_date) < new Date();
  const balanceDue = invoice ? invoice.total - invoice.amount_paid : 0;
  const statusConfig = invoice ? (STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft) : STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const handleSend = async () => {
    if (!invoice) return;
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/send`, { method: "POST" });
      if (response.ok) {
        toast({ title: "Invoice sent", description: "The invoice has been sent to the customer." });
        fetchInvoice();
        onRefresh();
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error || "Could not send.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send invoice.", variant: "destructive" });
    }
  };

  const handleVoid = async () => {
    if (!invoice || !confirm("Are you sure you want to void this invoice? This cannot be undone.")) return;
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Invoice voided" });
        fetchInvoice();
        onRefresh();
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to void invoice.", variant: "destructive" });
    }
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    try {
      toast({ title: "Generating PDF", description: "Please wait..." });
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${invoice.invoice_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Downloaded" });
      } else {
        toast({ title: "Failed", description: "Could not generate PDF.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to download PDF.", variant: "destructive" });
    }
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(paymentAmount) || balanceDue;
    if (amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    setPaymentLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          transaction_ref: paymentRef || undefined,
          payment_method: paymentMethod || undefined,
        }),
      });
      if (response.ok) {
        toast({ title: "Payment recorded", description: `${formatCurrency(amount, invoice.currency)} recorded.` });
        setShowPaymentDialog(false);
        setPaymentAmount("");
        setPaymentRef("");
        setPaymentMethod("");
        fetchInvoice();
        onRefresh();
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (!invoice) return;
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: invoice.customer_name,
          customer_email: invoice.customer_email,
          customer_phone: invoice.customer_phone,
          line_items: invoice.line_items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
          })),
          currency: invoice.currency,
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
          memo: invoice.memo,
          terms: invoice.terms,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Invoice duplicated", description: `Created ${data.invoice_number || "new draft"}.` });
        onRefresh();
        onBack();
      }
    } catch {
      toast({ title: "Error", description: "Failed to duplicate invoice.", variant: "destructive" });
    }
  };

  const handleCopyLink = () => {
    if (invoice) {
      const link = `${window.location.origin}/invoice/${invoice.id}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Link copied" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-foreground font-medium">Invoice not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const customerHasAddress = invoice.customer_address || invoice.customer_city || invoice.customer_state;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-invoices">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground" data-testid="text-invoice-number">{invoice.invoice_number}</h1>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                statusConfig.bgColor, statusConfig.color, statusConfig.borderColor
              )}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusConfig.label}
              </span>
              {isOverdue && invoice.status !== "overdue" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  Overdue
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {formatDate(invoice.created_at)}
              {invoice.sent_at && ` \u00B7 Sent ${formatDate(invoice.sent_at)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {invoice.status === "draft" && (
            <>
              <Button variant="outline" onClick={() => onEdit(invoice)} data-testid="button-edit-invoice">
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button onClick={handleSend} data-testid="button-send-invoice">
                <Send className="w-4 h-4 mr-2" />
                Send Invoice
              </Button>
            </>
          )}
          {!["paid", "void"].includes(invoice.status) && invoice.status !== "draft" && (
            <Button onClick={() => { setPaymentAmount(balanceDue.toFixed(2)); setShowPaymentDialog(true); }} data-testid="button-record-payment">
              <DollarSign className="w-4 h-4 mr-2" />
              Record Payment
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPDF} data-testid="button-download-pdf">
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-invoice-more">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleDuplicate} data-testid="menu-duplicate">
                <Copy className="w-4 h-4 mr-2" />
                Duplicate Invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyLink}>
                <Link2 className="w-4 h-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              {!["paid", "void"].includes(invoice.status) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleVoid} className="text-red-500 focus:text-red-500" data-testid="menu-void">
                    <Ban className="w-4 h-4 mr-2" />
                    Void Invoice
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-xl font-bold text-foreground mt-1" data-testid="text-invoice-total">
              {formatCurrency(invoice.total, invoice.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1" data-testid="text-invoice-paid">
              {formatCurrency(invoice.amount_paid, invoice.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance Due</p>
            <p className={cn("text-xl font-bold mt-1", balanceDue > 0 ? (isOverdue ? "text-red-600 dark:text-red-400" : "text-foreground") : "text-emerald-600 dark:text-emerald-400")} data-testid="text-balance-due">
              {formatCurrency(balanceDue, invoice.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Date</p>
            <p className={cn("text-xl font-bold mt-1", isOverdue ? "text-red-600 dark:text-red-400" : "text-foreground")} data-testid="text-due-date">
              {formatDate(invoice.due_date)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["details", "payments", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            data-testid={`tab-${tab}`}
          >
            {tab === "payments" ? `Payments (${(invoice.payment_history || []).length})` :
             tab === "activity" ? `Activity (${auditLogs.length})` : "Details"}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Description</th>
                        <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase w-20">Qty</th>
                        <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase w-24">Price</th>
                        {invoice.line_items.some(i => i.tax_rate) && (
                          <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground uppercase w-20">Tax</th>
                        )}
                        <th className="text-right py-2 pl-2 text-xs font-semibold text-muted-foreground uppercase w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.line_items.map((item, idx) => {
                        const lineAmount = Math.round(item.quantity * item.unit_price * 100) / 100;
                        return (
                          <tr key={idx}>
                            <td className="py-3 pr-4 text-foreground">{item.description}</td>
                            <td className="py-3 px-2 text-center text-muted-foreground">{item.quantity}</td>
                            <td className="py-3 px-2 text-right text-muted-foreground">{formatCurrency(item.unit_price, invoice.currency)}</td>
                            {invoice.line_items.some(i => i.tax_rate) && (
                              <td className="py-3 px-2 text-right text-muted-foreground">{item.tax_rate ? `${item.tax_rate}%` : "-"}</td>
                            )}
                            <td className="py-3 pl-2 text-right font-medium text-foreground">{formatCurrency(lineAmount, invoice.currency)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCurrency(invoice.subtotal || 0, invoice.currency)}</span>
                  </div>
                  {(invoice.tax_total || 0) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Tax</span>
                      <span className="font-medium">{formatCurrency(invoice.tax_total || 0, invoice.currency)}</span>
                    </div>
                  )}
                  {(invoice.discount_total || 0) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Discount {invoice.discount_type === "percentage" ? `(${invoice.discount_value}%)` : ""}
                      </span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">-{formatCurrency(invoice.discount_total || 0, invoice.currency)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="text-xl font-bold text-foreground">{formatCurrency(invoice.total, invoice.currency)}</span>
                  </div>
                  {invoice.amount_paid > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Amount Paid</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">-{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-dashed border-border">
                        <span className="font-semibold text-foreground">Balance Due</span>
                        <span className={cn("text-lg font-bold", balanceDue > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                          {formatCurrency(balanceDue, invoice.currency)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {(invoice.memo || invoice.terms) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Notes & Terms</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {invoice.memo && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Notes</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.memo}</p>
                      </div>
                    )}
                    {invoice.terms && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Terms & Conditions</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.terms}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-semibold text-foreground" data-testid="text-customer-name">{invoice.customer_name}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{invoice.customer_email}</span>
                  </div>
                  {invoice.customer_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{invoice.customer_phone}</span>
                    </div>
                  )}
                  {customerHasAddress && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        {invoice.customer_address && <p>{invoice.customer_address}</p>}
                        {(invoice.customer_city || invoice.customer_state || invoice.customer_zip) && (
                          <p>{[invoice.customer_city, invoice.customer_state].filter(Boolean).join(", ")} {invoice.customer_zip}</p>
                        )}
                        {invoice.customer_country && <p>{invoice.customer_country}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" />
                    <span>Invoice No.</span>
                  </div>
                  <span className="font-medium text-foreground">{invoice.invoice_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Issue Date</span>
                  </div>
                  <span className="font-medium text-foreground">{formatDate(invoice.issue_date)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Due Date</span>
                  </div>
                  <span className={cn("font-medium", isOverdue ? "text-red-600 dark:text-red-400" : "text-foreground")}>{formatDate(invoice.due_date)}</span>
                </div>
                {invoice.po_number && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      <span>PO Number</span>
                    </div>
                    <span className="font-medium text-foreground">{invoice.po_number}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Currency</span>
                  </div>
                  <span className="font-medium text-foreground">{invoice.currency}</span>
                </div>
                {invoice.require_signature && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <PenLine className="w-3.5 h-3.5" />
                      <span>Signature</span>
                    </div>
                    <span className={cn("font-medium", invoice.signed_at ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                      {invoice.signed_at ? "Signed" : "Required"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {invoice.status === "void" && invoice.voided_at && (
              <Card className="border-red-500/30">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Ban className="w-4 h-4 text-red-500" />
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">Voided</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(invoice.voided_at)}</p>
                  {invoice.void_reason && <p className="text-sm text-muted-foreground mt-1">{invoice.void_reason}</p>}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Payment History</h2>
              <p className="text-sm text-muted-foreground">{formatCurrency(invoice.amount_paid, invoice.currency)} of {formatCurrency(invoice.total, invoice.currency)} paid</p>
            </div>
            {!["paid", "void"].includes(invoice.status) && (
              <Button onClick={() => { setPaymentAmount(balanceDue.toFixed(2)); setShowPaymentDialog(true); }} data-testid="button-record-payment-tab">
                <Plus className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
          </div>

          {balanceDue > 0 && (
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (invoice.amount_paid / invoice.total) * 100)}%` }}
              />
            </div>
          )}

          {(invoice.payment_history || []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CreditCard className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">No payments recorded</p>
                <p className="text-sm text-muted-foreground mt-1">Payments will appear here once recorded.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {(invoice.payment_history || []).map((payment, idx) => (
                    <div key={payment.id || idx} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {payment.method || "Manual Payment"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(payment.recorded_at || payment.date || "")}
                            {(payment.reference || payment.transaction_ref) && ` \u00B7 Ref: ${payment.reference || payment.transaction_ref}`}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(payment.amount, invoice.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
            <p className="text-sm text-muted-foreground">Complete audit trail for this invoice</p>
          </div>

          {auditLogs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <History className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">No activity recorded</p>
                <p className="text-sm text-muted-foreground mt-1">Actions taken on this invoice will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-6">
                    {auditLogs.map((log) => {
                      const actionConfig = AUDIT_ACTION_LABELS[log.action] || {
                        label: log.action.replace(/_/g, " "),
                        icon: FileText,
                        color: "text-muted-foreground",
                      };
                      const ActionIcon = actionConfig.icon;

                      return (
                        <div key={log.id} className="relative flex gap-3">
                          <div className={cn(
                            "absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center bg-background border-2 border-border z-10",
                          )}>
                            <ActionIcon className={cn("w-3 h-3", actionConfig.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{actionConfig.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDateTime(log.created_at)}
                              {log.actor_type === "user" && log.actor_id && ` \u00B7 by ${log.actor_id}`}
                              {log.actor_type === "customer" && " \u00B7 by customer"}
                              {log.actor_type === "system" && " \u00B7 automated"}
                            </p>
                            {Object.keys(log.metadata || {}).length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {Object.entries(log.metadata).map(([k, v]) => `${k}: ${v}`).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {invoice.invoice_number}. Balance due: {formatCurrency(balanceDue, invoice.currency)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balanceDue}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={balanceDue.toFixed(2)}
                data-testid="input-payment-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-method">Method (optional)</Label>
              <Input
                id="payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="e.g. Bank Transfer, Check, Cash"
                data-testid="input-payment-method"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-ref">Reference (optional)</Label>
              <Input
                id="payment-ref"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. Transaction ID, Check #"
                data-testid="input-payment-ref"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={paymentLoading} data-testid="button-confirm-payment">
              {paymentLoading ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  MoreHorizontal,
  Send,
  Eye,
  Trash2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  RefreshCw,
  Link2,
  Copy,
  ExternalLink,
  Loader2,
  PenLine,
  TrendingUp,
  Receipt,
  Calendar,
  CreditCard,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { InvoiceForm } from "./invoice-form";
import { InvoiceDetailView } from "./invoice-detail-view";
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
  line_items: LineItem[];
  subtotal?: number;
  tax_total?: number;
  total: number;
  amount_paid: number;
  currency: string;
  issue_date: string;
  due_date: string;
  memo?: string | null;
  terms?: string | null;
  require_signature?: boolean;
  require_signature_before_payment?: boolean;
  signed_at?: string | null;
  signature_envelope_id?: string | null;
  created_at: string;
}

interface InvoiceStats {
  total_invoices: number;
  total_amount: number;
  total_paid: number;
  total_outstanding: number;
  overdue_count: number;
  overdue_amount: number;
  by_status: Record<string, number>;
}

// Status configuration with colors and icons - using theme-aware colors
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "text-muted-foreground", bgColor: "bg-muted", icon: FileText },
  sent: { label: "Sent", color: "text-amber-400", bgColor: "bg-amber-500/10", icon: Send },
  viewed: { label: "Viewed", color: "text-sky-400", bgColor: "bg-sky-500/10", icon: Eye },
  signed: { label: "Signed", color: "text-violet-400", bgColor: "bg-violet-500/10", icon: PenLine },
  partially_paid: { label: "Partial", color: "text-orange-400", bgColor: "bg-orange-500/10", icon: CreditCard },
  paid: { label: "Paid", color: "text-emerald-400", bgColor: "bg-emerald-500/10", icon: CheckCircle2 },
  overdue: { label: "Overdue", color: "text-red-400", bgColor: "bg-red-500/10", icon: AlertTriangle },
  void: { label: "Void", color: "text-muted-foreground", bgColor: "bg-muted", icon: Ban },
};

export function InvoicesPage() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [showPaymentLinkDialog, setShowPaymentLinkDialog] = useState(false);
  const [paymentLinkData, setPaymentLinkData] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    paymentUrl: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const initializeTables = useCallback(async () => {
    try {
      if (process.env.NODE_ENV !== 'production') console.log("Initializing invoicing tables...");
      const response = await fetch("/api/invoices/init", { method: "POST" });
      if (response.ok) {
        if (process.env.NODE_ENV !== 'production') console.log("Tables initialized successfully");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to initialize tables:", error);
      return false;
    }
  }, []);

  const fetchInvoices = useCallback(async (retryAfterInit = true) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(`/api/invoices?${params}`);

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("API returned non-JSON response:", response.status);
        if (retryAfterInit) {
          const initialized = await initializeTables();
          if (initialized) {
            await fetchInvoices(false);
            return;
          }
        }
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setInvoices(data.invoices || []);
        setTotalPages(data.total_pages || 1);
      } else if (data.error?.includes("does not exist") && retryAfterInit) {
        const initialized = await initializeTables();
        if (initialized) {
          await fetchInvoices(false);
          return;
        }
      }
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, initializeTables]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/invoices/stats");

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Stats API returned non-JSON response:", response.status);
        return;
      }

      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchStats();
  }, [fetchInvoices, fetchStats]);

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send`, { method: "POST" });
      if (response.ok) {
        toast({ title: "Invoice sent", description: "The invoice has been sent to the customer." });
        fetchInvoices();
        fetchStats();
      } else {
        const data = await response.json();
        toast({ title: "Failed to send", description: data.error || "Could not send the invoice.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send invoice.", variant: "destructive" });
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to void this invoice?")) return;
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Invoice voided", description: "The invoice has been voided." });
        fetchInvoices();
        fetchStats();
      } else {
        const data = await response.json();
        toast({ title: "Failed to void", description: data.error || "Could not void the invoice.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to void invoice.", variant: "destructive" });
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        toast({ title: "Payment recorded", description: "The invoice has been marked as paid." });
        fetchInvoices();
        fetchStats();
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error || "Could not record the payment.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    }
  };

  const handleDuplicate = (invoice: Invoice) => {
    const dup: any = {
      customer_name: invoice.customer_name,
      customer_email: invoice.customer_email,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_city: invoice.customer_city,
      customer_state: invoice.customer_state,
      customer_zip: invoice.customer_zip,
      customer_country: invoice.customer_country,
      line_items: (invoice.line_items || []).map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
      })),
      currency: invoice.currency,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      memo: invoice.memo,
      terms: invoice.terms,
      po_number: null,
      discount_type: invoice.discount_type,
      discount_value: invoice.discount_value,
    };
    setEditingInvoice(dup);
  };

  const handleGeneratePaymentLink = async (invoice: Invoice) => {
    if (["draft", "paid", "void"].includes(invoice.status)) {
      toast({ title: "Cannot generate", description: "Invoice must be sent before generating a payment link.", variant: "destructive" });
      return;
    }

    setPaymentLinkData({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paymentUrl: null, loading: true, error: null });
    setShowPaymentLinkDialog(true);

    try {
      const existingResponse = await fetch(`/api/invoices/${invoice.id}/payment-link`);
      if (existingResponse.ok) {
        const existingLink = await existingResponse.json();
        setPaymentLinkData({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paymentUrl: existingLink.payment_url, loading: false, error: null });
        return;
      }

      const response = await fetch(`/api/invoices/${invoice.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const link = await response.json();
        setPaymentLinkData({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paymentUrl: link.payment_url, loading: false, error: null });
      } else {
        const data = await response.json();
        setPaymentLinkData({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paymentUrl: null, loading: false, error: data.error || "Failed to generate. Configure a payment processor first." });
      }
    } catch {
      setPaymentLinkData({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paymentUrl: null, loading: false, error: "Failed to generate payment link." });
    }
  };

  const handleCopyPaymentLink = () => {
    if (paymentLinkData?.paymentUrl) {
      navigator.clipboard.writeText(paymentLinkData.paymentUrl);
      toast({ title: "Copied", description: "Payment link copied to clipboard." });
    }
  };

  const handleDownloadPDF = async (invoiceId: string) => {
    try {
      toast({ title: "Generating PDF", description: "Please wait..." });
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `invoice-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Downloaded", description: "Invoice PDF downloaded." });
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error || "Could not generate PDF.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to download PDF.", variant: "destructive" });
    }
  };

  const handleRequestSignature = async (invoice: Invoice) => {
    try {
      toast({ title: "Requesting signature", description: "Sending request..." });
      const response = await fetch(`/api/invoices/${invoice.id}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Please review and sign invoice ${invoice.invoice_number}`, expiration_days: 30, enable_reminders: true }),
      });
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Signature requested", description: "Customer will receive a signing link." });
        if (data.signing_url) {
          await navigator.clipboard.writeText(data.signing_url);
          toast({ title: "Link copied", description: "Signing link copied to clipboard." });
        }
        fetchInvoices();
        fetchStats();
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error || "Could not send signature request.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to request signature.", variant: "destructive" });
    }
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isOverdue = (invoice: Invoice) => {
    if (["paid", "void"].includes(invoice.status)) return false;
    return new Date(invoice.due_date) < new Date();
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  };

  if (viewingInvoiceId) {
    return (
      <InvoiceDetailView
        invoiceId={viewingInvoiceId}
        onBack={() => setViewingInvoiceId(null)}
        onEdit={(inv) => { setViewingInvoiceId(null); setEditingInvoice(inv); }}
        onRefresh={() => { fetchInvoices(); fetchStats(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, send, and track invoices with integrated payments
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-new-invoice"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Outstanding */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(stats.total_outstanding)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total_invoices - (stats.by_status.paid || 0) - (stats.by_status.void || 0)} unpaid invoices
                </p>
              </div>
              <div className="p-2.5 bg-amber-500/10 rounded-lg">
                <Receipt className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </div>

          {/* Paid */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {formatCurrency(stats.total_paid)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.by_status.paid || 0} paid invoices
                </p>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Overdue */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  {formatCurrency(stats.overdue_amount)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.overdue_count} overdue invoice{stats.overdue_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-2.5 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">All Time</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(stats.total_amount)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total_invoices} total invoices
                </p>
              </div>
              <div className="p-2.5 bg-blue-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer, email, or invoice number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
          <SelectTrigger className="w-40 h-10">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="viewed">Viewed</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => { fetchInvoices(); fetchStats(); }}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Invoices Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-muted/50 border-b border-border">
          <div className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</div>
          <div className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</div>
          <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</div>
          <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Amount</div>
          <div className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</div>
          <div className="col-span-1"></div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">No invoices found</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first invoice to get started</p>
            <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => {
              const statusConfig = getStatusConfig(invoice.status);
              const StatusIcon = statusConfig.icon;
              const overdueCheck = isOverdue(invoice) && invoice.status !== "overdue";

              return (
                <div key={invoice.id} className="grid md:grid-cols-12 gap-4 px-5 py-4 hover-elevate cursor-pointer transition-colors items-center" onClick={() => setViewingInvoiceId(invoice.id)} data-testid={`row-invoice-${invoice.id}`}>
                  {/* Invoice Info */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Receipt className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(invoice.issue_date)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Customer */}
                  <div className="md:col-span-3">
                    <p className="font-medium text-foreground truncate">{invoice.customer_name}</p>
                    <p className="text-sm text-muted-foreground truncate">{invoice.customer_email}</p>
                  </div>

                  {/* Status */}
                  <div className="md:col-span-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        statusConfig.bgColor,
                        statusConfig.color
                      )}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                      {invoice.signed_at && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400">
                          <PenLine className="w-3 h-3" />
                          Signed
                        </span>
                      )}
                      {overdueCheck && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          Overdue
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="md:col-span-2 text-right">
                    <p className="font-semibold text-foreground">{formatCurrency(invoice.total, invoice.currency)}</p>
                    {invoice.amount_paid > 0 && invoice.amount_paid < invoice.total && (
                      <p className="text-xs text-muted-foreground">
                        Paid: {formatCurrency(invoice.amount_paid, invoice.currency)}
                      </p>
                    )}
                  </div>

                  {/* Due Date */}
                  <div className="md:col-span-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={cn(
                        "text-sm",
                        overdueCheck ? "text-red-400 font-medium" : "text-muted-foreground"
                      )}>
                        {formatDate(invoice.due_date)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="md:col-span-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setViewingInvoiceId(invoice.id)} data-testid={`menu-view-${invoice.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {invoice.status === "draft" && (
                          <DropdownMenuItem onClick={() => setEditingInvoice(invoice)}>
                            <FileText className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDuplicate(invoice)} data-testid={`menu-duplicate-${invoice.id}`}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        {invoice.status === "draft" && (
                          <DropdownMenuItem onClick={() => handleSendInvoice(invoice.id)}>
                            <Send className="w-4 h-4 mr-2" />
                            Send Invoice
                          </DropdownMenuItem>
                        )}
                        {!["paid", "void"].includes(invoice.status) && (
                          <DropdownMenuItem onClick={() => handleMarkPaid(invoice.id)}>
                            <DollarSign className="w-4 h-4 mr-2" />
                            Mark as Paid
                          </DropdownMenuItem>
                        )}
                        {!["draft", "paid", "void"].includes(invoice.status) && (
                          <DropdownMenuItem onClick={() => handleGeneratePaymentLink(invoice)}>
                            <Link2 className="w-4 h-4 mr-2" />
                            Payment Link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDownloadPDF(invoice.id)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!["paid", "void"].includes(invoice.status) && (
                          <DropdownMenuItem onClick={() => handleVoidInvoice(invoice.id)} className="text-red-500 focus:text-red-500">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Void Invoice
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Invoice</DialogTitle>
            <DialogDescription>
              Fill in the details below to create a new invoice. It will be saved as a draft.
            </DialogDescription>
          </DialogHeader>
          <div className="pb-safe">
            <InvoiceForm
              onSuccess={() => { setShowCreateDialog(false); fetchInvoices(); fetchStats(); }}
              onCancel={() => setShowCreateDialog(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit/View Invoice Dialog */}
      <Dialog open={!!editingInvoice} onOpenChange={(open) => !open && setEditingInvoice(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingInvoice?.status === "draft" ? "Edit" : "View"} Invoice {editingInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="pb-safe">
          {editingInvoice && (
            <InvoiceForm
              invoice={editingInvoice}
              readOnly={editingInvoice.status !== "draft"}
              onSuccess={() => { setEditingInvoice(null); fetchInvoices(); fetchStats(); }}
              onCancel={() => setEditingInvoice(null)}
            />
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Link Dialog */}
      <Dialog open={showPaymentLinkDialog} onOpenChange={setShowPaymentLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" />
              Payment Link
            </DialogTitle>
            <DialogDescription>
              Share this link with your customer to collect payment for {paymentLinkData?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {paymentLinkData?.loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
                <p className="text-sm text-muted-foreground">Generating payment link...</p>
              </div>
            ) : paymentLinkData?.error ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Unable to generate payment link</p>
                    <p className="text-sm text-red-400/80 mt-1">{paymentLinkData.error}</p>
                  </div>
                </div>
              </div>
            ) : paymentLinkData?.paymentUrl ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="font-medium text-emerald-400">Payment link ready</span>
                  </div>
                  <div className="bg-background border border-border rounded-lg p-3 text-sm text-foreground break-all font-mono">
                    {paymentLinkData.paymentUrl}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleCopyPaymentLink}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Link
                  </Button>
                  <Button variant="outline" onClick={() => paymentLinkData?.paymentUrl && window.open(paymentLinkData.paymentUrl, '_blank')}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentLinkDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

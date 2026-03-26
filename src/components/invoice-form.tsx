"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, AlertCircle, Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  amount?: number;
}

interface Invoice {
  id?: string;
  invoice_number?: string;
  status?: string;
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
  total?: number;
  currency: string;
  issue_date: string;
  due_date: string;
  memo?: string | null;
  terms?: string | null;
  po_number?: string | null;
}

interface InvoiceFormProps {
  invoice?: Invoice;
  readOnly?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "\u20AC", name: "Euro" },
  { code: "GBP", symbol: "\u00A3", name: "British Pound" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "ILS", symbol: "\u20AA", name: "Israeli Shekel" },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-500/10 text-amber-400",
  viewed: "bg-sky-500/10 text-sky-400",
  signed: "bg-violet-500/10 text-violet-400",
  partially_paid: "bg-orange-500/10 text-orange-400",
  paid: "bg-emerald-500/10 text-emerald-400",
  overdue: "bg-red-500/10 text-red-400",
  void: "bg-muted text-muted-foreground",
};

export function InvoiceForm({
  invoice,
  readOnly = false,
  onSuccess,
  onCancel,
}: InvoiceFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(
    !!(invoice?.customer_address || invoice?.customer_city)
  );
  const [showTax, setShowTax] = useState(
    invoice?.line_items?.some(i => i.tax_rate) || false
  );

  const [formData, setFormData] = useState<Invoice>({
    customer_name: invoice?.customer_name || "",
    customer_email: invoice?.customer_email || "",
    customer_phone: invoice?.customer_phone || "",
    customer_address: invoice?.customer_address || "",
    customer_city: invoice?.customer_city || "",
    customer_state: invoice?.customer_state || "",
    customer_zip: invoice?.customer_zip || "",
    customer_country: invoice?.customer_country || "",
    line_items: invoice?.line_items?.length ? invoice.line_items : [
      { description: "", quantity: 1, unit_price: 0, tax_rate: null },
    ],
    currency: invoice?.currency || "USD",
    issue_date: invoice?.issue_date?.split('T')[0] || new Date().toISOString().split("T")[0],
    due_date: invoice?.due_date?.split('T')[0] || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    memo: invoice?.memo || "",
    terms: invoice?.terms || "Payment due within 30 days of invoice date.",
    po_number: invoice?.po_number || "",
    discount_type: invoice?.discount_type || null,
    discount_value: invoice?.discount_value || 0,
  });

  const calculateLineAmount = (item: LineItem): number => {
    return Math.round(item.quantity * item.unit_price * 100) / 100;
  };

  const totals = useMemo(() => {
    const subtotal = formData.line_items.reduce(
      (sum, item) => sum + calculateLineAmount(item),
      0
    );
    const taxTotal = formData.line_items.reduce((sum, item) => {
      const amount = calculateLineAmount(item);
      const taxRate = item.tax_rate || 0;
      return sum + (amount * taxRate) / 100;
    }, 0);

    let discountTotal = 0;
    if (formData.discount_type === "percentage" && formData.discount_value) {
      discountTotal = (subtotal * formData.discount_value) / 100;
    } else if (formData.discount_type === "flat" && formData.discount_value) {
      discountTotal = formData.discount_value;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_total: Math.round(taxTotal * 100) / 100,
      discount_total: Math.round(discountTotal * 100) / 100,
      total: Math.round((subtotal + taxTotal - discountTotal) * 100) / 100,
    };
  }, [formData.line_items, formData.discount_type, formData.discount_value]);

  const addLineItem = () => {
    setFormData({
      ...formData,
      line_items: [
        ...formData.line_items,
        { description: "", quantity: 1, unit_price: 0, tax_rate: null },
      ],
    });
  };

  const removeLineItem = (index: number) => {
    if (formData.line_items.length <= 1) return;
    setFormData({
      ...formData,
      line_items: formData.line_items.filter((_, i) => i !== index),
    });
  };

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: string | number | null
  ) => {
    const updated = [...formData.line_items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, line_items: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setError(null);

    if (!formData.customer_name.trim()) {
      setError("Customer name is required");
      return;
    }
    if (!formData.customer_email.trim()) {
      setError("Customer email is required");
      return;
    }
    if (!formData.line_items.some(item => item.description.trim())) {
      setError("At least one line item with a description is required");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        customer_name: formData.customer_name.trim(),
        customer_email: formData.customer_email.trim(),
        customer_phone: formData.customer_phone?.trim() || null,
        customer_address: formData.customer_address?.trim() || null,
        customer_city: formData.customer_city?.trim() || null,
        customer_state: formData.customer_state?.trim() || null,
        customer_zip: formData.customer_zip?.trim() || null,
        customer_country: formData.customer_country?.trim() || null,
        line_items: formData.line_items
          .filter(item => item.description.trim())
          .map((item) => ({
            description: item.description.trim(),
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            tax_rate: showTax && item.tax_rate ? Number(item.tax_rate) : null,
          })),
        currency: formData.currency,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        memo: formData.memo?.trim() || null,
        terms: formData.terms?.trim() || null,
        po_number: formData.po_number?.trim() || null,
        discount_type: formData.discount_type || null,
        discount_value: formData.discount_value || 0,
      };

      const url = invoice?.id ? `/api/invoices/${invoice.id}` : "/api/invoices";
      const method = invoice?.id ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: invoice?.id ? "Invoice updated" : "Invoice created",
          description: invoice?.id
            ? "Your changes have been saved."
            : `Invoice ${data.invoice_number || ''} has been created.`,
        });
        onSuccess();
      } else {
        setError(data.error || "Failed to save invoice");
        toast({
          title: "Error",
          description: data.error || "Failed to save invoice.",
          variant: "destructive",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save invoice";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const currencySymbol = CURRENCIES.find((c) => c.code === formData.currency)?.symbol || "$";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-md text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {invoice?.invoice_number && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-md">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Invoice</p>
              <p className="text-lg font-semibold">{invoice.invoice_number}</p>
            </div>
          </div>
          {invoice.status && (
            <Badge className={STATUS_STYLES[invoice.status] || STATUS_STYLES.draft}>
              {invoice.status.replace("_", " ").toUpperCase()}
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">
                Customer Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Acme Corporation"
                required
                disabled={readOnly}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customer_email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                placeholder="billing@acme.com"
                required
                disabled={readOnly}
                data-testid="input-customer-email"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="customer_phone">Phone (optional)</Label>
            <Input
              id="customer_phone"
              value={formData.customer_phone || ""}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
              disabled={readOnly}
              data-testid="input-customer-phone"
            />
          </div>

          {!showAddress && !readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddress(true)}
              className="text-muted-foreground"
              data-testid="button-add-address"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Billing Address
            </Button>
          ) : showAddress ? (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Billing Address</Label>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddress(false)} className="text-muted-foreground text-xs">
                    Remove
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  value={formData.customer_address || ""}
                  onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                  placeholder="Street address"
                  disabled={readOnly}
                  data-testid="input-customer-address"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Input
                    value={formData.customer_city || ""}
                    onChange={(e) => setFormData({ ...formData, customer_city: e.target.value })}
                    placeholder="City"
                    disabled={readOnly}
                    data-testid="input-customer-city"
                  />
                </div>
                <Input
                  value={formData.customer_state || ""}
                  onChange={(e) => setFormData({ ...formData, customer_state: e.target.value })}
                  placeholder="State"
                  disabled={readOnly}
                  data-testid="input-customer-state"
                />
                <Input
                  value={formData.customer_zip || ""}
                  onChange={(e) => setFormData({ ...formData, customer_zip: e.target.value })}
                  placeholder="ZIP"
                  disabled={readOnly}
                  data-testid="input-customer-zip"
                />
                <div className="col-span-2 sm:col-span-1">
                  <Input
                    value={formData.customer_country || ""}
                    onChange={(e) => setFormData({ ...formData, customer_country: e.target.value })}
                    placeholder="Country"
                    disabled={readOnly}
                    data-testid="input-customer-country"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issue_date">Issue Date</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                disabled={readOnly}
                data-testid="input-issue-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">
                Due Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
                disabled={readOnly}
                data-testid="input-due-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
                disabled={readOnly}
              >
                <SelectTrigger data-testid="select-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      {curr.symbol} {curr.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                value={formData.po_number || ""}
                onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                placeholder="Optional"
                disabled={readOnly}
                data-testid="input-po-number"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Line Items</CardTitle>
            <div className="flex items-center gap-2">
              {!readOnly && !showTax && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowTax(true)} className="text-muted-foreground text-xs" data-testid="button-add-tax">
                  <Plus className="w-3 h-3 mr-1" />
                  Tax
                </Button>
              )}
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={addLineItem} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`hidden sm:grid gap-2 text-xs font-medium text-muted-foreground uppercase pb-2 border-b ${showTax ? "grid-cols-[1fr_80px_100px_70px_90px_36px]" : "grid-cols-[1fr_80px_100px_90px_36px]"}`}>
            <div>Description</div>
            <div className="text-center">Qty</div>
            <div className="text-center">Price</div>
            {showTax && <div className="text-center">Tax %</div>}
            <div className="text-right">Amount</div>
            <div />
          </div>

          {formData.line_items.map((item, index) => (
            <div key={index} className={`grid gap-2 items-center ${showTax ? "sm:grid-cols-[1fr_80px_100px_70px_90px_36px]" : "sm:grid-cols-[1fr_80px_100px_90px_36px]"}`}>
              <Input
                value={item.description}
                onChange={(e) => updateLineItem(index, "description", e.target.value)}
                placeholder="Service or product description"
                disabled={readOnly}
                data-testid={`input-line-desc-${index}`}
              />
              <div className="grid grid-cols-3 sm:contents gap-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, "quantity", Number.parseFloat(e.target.value) || 0)}
                  className="text-center"
                  disabled={readOnly}
                  data-testid={`input-line-qty-${index}`}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateLineItem(index, "unit_price", Number.parseFloat(e.target.value) || 0)}
                  className="text-center"
                  disabled={readOnly}
                  data-testid={`input-line-price-${index}`}
                />
                {showTax && (
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.tax_rate || ""}
                    onChange={(e) => updateLineItem(index, "tax_rate", e.target.value ? Number.parseFloat(e.target.value) : null)}
                    className="text-center"
                    placeholder="0"
                    disabled={readOnly}
                    data-testid={`input-line-tax-${index}`}
                  />
                )}
                <div className="flex items-center justify-end">
                  <span className="font-medium text-sm">
                    {currencySymbol}{calculateLineAmount(item).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                {!readOnly && formData.line_items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(index)}
                    data-testid={`button-remove-item-${index}`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="pt-4 mt-4 border-t space-y-2">
            <div className="flex justify-end items-center gap-4">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="font-medium w-28 text-right">
                {currencySymbol}{totals.subtotal.toFixed(2)}
              </span>
            </div>
            {showTax && totals.tax_total > 0 && (
              <div className="flex justify-end items-center gap-4">
                <span className="text-sm text-muted-foreground">Tax</span>
                <span className="font-medium w-28 text-right">
                  {currencySymbol}{totals.tax_total.toFixed(2)}
                </span>
              </div>
            )}
            {formData.discount_type && totals.discount_total > 0 && (
              <div className="flex justify-end items-center gap-4">
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  Discount {formData.discount_type === "percentage" ? `(${formData.discount_value}%)` : ""}
                </span>
                <span className="font-medium w-28 text-right text-emerald-600 dark:text-emerald-400">
                  -{currencySymbol}{totals.discount_total.toFixed(2)}
                </span>
              </div>
            )}

            {!readOnly && !formData.discount_type && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, discount_type: "percentage", discount_value: 0 })}
                  className="text-muted-foreground text-xs"
                  data-testid="button-add-discount"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Discount
                </Button>
              </div>
            )}

            {formData.discount_type && !readOnly && (
              <div className="flex justify-end items-center gap-2 pt-1">
                <Select
                  value={formData.discount_type}
                  onValueChange={(val) => setFormData({ ...formData, discount_type: val })}
                >
                  <SelectTrigger className="w-28" data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percent %</SelectItem>
                    <SelectItem value="flat">Flat {currencySymbol}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.discount_value || ""}
                  onChange={(e) => setFormData({ ...formData, discount_value: Number.parseFloat(e.target.value) || 0 })}
                  className="w-24 text-center"
                  placeholder="0"
                  data-testid="input-discount-value"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormData({ ...formData, discount_type: null, discount_value: 0 })}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            )}

            <div className="flex justify-end items-center gap-4 pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold w-28 text-right" data-testid="text-form-total">
                {currencySymbol}{totals.total.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Notes & Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="memo">Notes for Customer (optional)</Label>
              <Textarea
                id="memo"
                value={formData.memo || ""}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                placeholder="Thank you for your business!"
                rows={3}
                disabled={readOnly}
                data-testid="input-memo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={formData.terms || ""}
                onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                placeholder="Payment is due within 30 days..."
                rows={3}
                disabled={readOnly}
                data-testid="input-terms"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={loading} data-testid="button-submit-invoice">
            {loading ? "Saving..." : invoice?.id ? "Update Invoice" : "Create Invoice"}
          </Button>
        )}
      </div>
    </form>
  );
}

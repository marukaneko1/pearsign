"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Plus,
  Upload,
  Trash2,
  Star,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  Building2,
  Globe,
  Mail,
  Calendar,
  Fingerprint,
  FileKey,
  RefreshCw,
  Info,
  Lock,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from "lucide-react";

interface Certificate {
  id: string;
  name: string;
  usage: string;
  subject: {
    commonName: string;
    organizationName: string;
    countryName?: string;
    emailAddress?: string;
  };
  issuer: {
    commonName: string;
    organizationName: string;
    countryName?: string;
  };
  serialNumber: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isDefault: boolean;
  isSelfSigned: boolean;
  isCAIssued: boolean;
  chainValidated: boolean;
  hasChain: boolean;
  chainCertificateCount: number;
  hasPrivateKey: boolean;
  createdAt: string;
  isValid: boolean;
  isExpired: boolean;
}

interface ValidationResult {
  isValid: boolean;
  isSelfSigned: boolean;
  isExpired: boolean;
  isNotYetValid: boolean;
  chainComplete: boolean;
  chainValid: boolean;
  errors: string[];
  warnings: string[];
  subject: {
    commonName: string;
    organizationName: string;
    countryName?: string;
    emailAddress?: string;
  };
  issuer: {
    commonName: string;
    organizationName: string;
    countryName?: string;
  };
  validFrom: string;
  validTo: string;
  fingerprint: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
}

export function CertificatesSettings() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Generate form state
  const [generateForm, setGenerateForm] = useState({
    commonName: "",
    organizationName: "",
    countryName: "US",
    emailAddress: "",
    validityDays: "1095", // 3 years
  });

  const [importForm, setImportForm] = useState({
    name: "",
    certificate: "",
    privateKey: "",
    privateKeyPassword: "",
    certificateChain: "",
    caBundle: "",
  });

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/certificates");
      const data = await response.json();
      if (data.success) {
        setCertificates(data.data || []);
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to load certificates",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to load certificates:", error);
      toast({
        title: "Error",
        description: "Failed to load certificates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  const handleGenerateCertificate = async () => {
    if (!generateForm.commonName || !generateForm.organizationName) {
      toast({
        title: "Validation Error",
        description: "Common Name and Organization are required",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/settings/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          commonName: generateForm.commonName,
          organizationName: generateForm.organizationName,
          countryName: generateForm.countryName || undefined,
          emailAddress: generateForm.emailAddress || undefined,
          validityDays: parseInt(generateForm.validityDays, 10),
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Certificate Generated",
          description: "Self-signed certificate created successfully",
        });
        setShowGenerateDialog(false);
        setGenerateForm({
          commonName: "",
          organizationName: "",
          countryName: "US",
          emailAddress: "",
          validityDays: "1095",
        });
        loadCertificates();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to generate certificate",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to generate certificate:", error);
      toast({
        title: "Error",
        description: "Failed to generate certificate",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleValidateCertificate = async () => {
    if (!importForm.certificate) {
      toast({
        title: "Validation Error",
        description: "Please provide a certificate to validate",
        variant: "destructive",
      });
      return;
    }

    setValidating(true);
    setValidationResult(null);
    try {
      const chainArray = importForm.certificateChain
        ? importForm.certificateChain
            .split(/-----END CERTIFICATE-----/)
            .filter((c) => c.includes("-----BEGIN CERTIFICATE-----"))
            .map((c) => c.trim() + "\n-----END CERTIFICATE-----")
        : [];

      const response = await fetch("/api/settings/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          certificate: importForm.certificate,
          certificateChain: chainArray,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setValidationResult(data.validation);
      } else {
        toast({
          title: "Validation Failed",
          description: data.error || "Failed to validate certificate",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to validate certificate:", error);
      toast({
        title: "Error",
        description: "Failed to validate certificate",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportCertificate = async () => {
    if (!importForm.certificate || !importForm.privateKey) {
      toast({
        title: "Validation Error",
        description: "Certificate and Private Key are required",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    try {
      const chainArray = importForm.certificateChain
        ? importForm.certificateChain
            .split(/-----END CERTIFICATE-----/)
            .filter((c) => c.includes("-----BEGIN CERTIFICATE-----"))
            .map((c) => c.trim() + "\n-----END CERTIFICATE-----")
        : [];

      const response = await fetch("/api/settings/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          name: importForm.name || undefined,
          certificate: importForm.certificate,
          privateKey: importForm.privateKey,
          privateKeyPassword: importForm.privateKeyPassword || undefined,
          certificateChain: chainArray,
          caBundle: importForm.caBundle || undefined,
          setAsDefault: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Certificate Imported",
          description: data.message || "Certificate imported successfully",
        });
        setShowImportDialog(false);
        setImportForm({
          name: "",
          certificate: "",
          privateKey: "",
          privateKeyPassword: "",
          certificateChain: "",
          caBundle: "",
        });
        setValidationResult(null);
        loadCertificates();
      } else {
        toast({
          title: "Import Failed",
          description: data.error || "Failed to import certificate",
          variant: "destructive",
        });
        if (data.validation) {
          setValidationResult(data.validation);
        }
      }
    } catch (error) {
      console.error("Failed to import certificate:", error);
      toast({
        title: "Error",
        description: "Failed to import certificate",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSetDefault = async (certId: string) => {
    try {
      const response = await fetch("/api/settings/certificates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificateId: certId }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Default Updated",
          description: "Default signing certificate updated",
        });
        loadCertificates();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to set default certificate",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to set default certificate:", error);
      toast({
        title: "Error",
        description: "Failed to set default certificate",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCertificate = async () => {
    if (!selectedCert) return;

    try {
      const response = await fetch(
        `/api/settings/certificates?id=${selectedCert.id}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Certificate Deleted",
          description: "Certificate removed successfully",
        });
        setShowDeleteDialog(false);
        setSelectedCert(null);
        loadCertificates();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete certificate",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to delete certificate:", error);
      toast({
        title: "Error",
        description: "Failed to delete certificate",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getDaysUntilExpiry = (validTo: string) => {
    const expiry = new Date(validTo);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Signing Certificates</h2>
          <p className="text-muted-foreground mt-1">
            Manage X.509 certificates for digital document signatures
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import CA Certificate
          </Button>
          <Button
            onClick={() => setShowGenerateDialog(true)}
            className="gap-2 bg-[hsl(var(--pearsign-primary))] hover:bg-[hsl(var(--pearsign-primary))]/90"
          >
            <Plus className="h-4 w-4" />
            Generate Certificate
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                About Digital Certificates
              </p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                Certificates are used to cryptographically sign PDF documents, making them
                tamper-evident and legally binding. Self-signed certificates work for internal
                use, while CA-issued certificates are recognized by Adobe Acrobat and other
                PDF readers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certificates List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Your Certificates
              </CardTitle>
              <CardDescription>
                {certificates.length} certificate{certificates.length !== 1 ? "s" : ""} configured
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadCertificates}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : certificates.length === 0 ? (
            <div className="text-center py-12">
              <FileKey className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-2">No certificates yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                Generate a self-signed certificate or import a CA-issued certificate to
                enable digital signatures.
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
                <Button
                  onClick={() => setShowGenerateDialog(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Generate
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {certificates.map((cert) => {
                const daysUntilExpiry = getDaysUntilExpiry(cert.validTo);
                const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry > 0;

                return (
                  <div
                    key={cert.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border transition-colors",
                      cert.isDefault
                        ? "bg-[hsl(var(--pearsign-primary))]/5 border-[hsl(var(--pearsign-primary))]/20"
                        : "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                          cert.isCAIssued
                            ? "bg-green-100 dark:bg-green-900/30"
                            : "bg-blue-100 dark:bg-blue-900/30"
                        )}
                      >
                        {cert.isCAIssued ? (
                          <Building2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Key className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{cert.name || cert.subject.commonName}</span>
                          {cert.isDefault && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Star className="h-3 w-3 fill-current" />
                              Default
                            </Badge>
                          )}
                          {cert.isSelfSigned ? (
                            <Badge variant="outline" className="text-xs">
                              Self-signed
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                            >
                              CA-issued
                            </Badge>
                          )}
                          {cert.isExpired && (
                            <Badge variant="destructive" className="text-xs">
                              Expired
                            </Badge>
                          )}
                          {isExpiringSoon && !cert.isExpired && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800"
                            >
                              Expiring soon
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {cert.subject.organizationName}
                            </span>
                            {cert.subject.emailAddress && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {cert.subject.emailAddress}
                              </span>
                            )}
                            {cert.chainCertificateCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                {cert.chainCertificateCount} chain cert{cert.chainCertificateCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Valid: {formatDate(cert.validFrom)} - {formatDate(cert.validTo)}
                            </span>
                            {!cert.isExpired && (
                              <span className={cn(
                                isExpiringSoon ? "text-yellow-600" : "text-muted-foreground"
                              )}>
                                ({daysUntilExpiry} days remaining)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCert(cert);
                          setShowDetailsDialog(true);
                        }}
                      >
                        Details
                      </Button>
                      {!cert.isDefault && !cert.isExpired && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(cert.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      {!cert.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setSelectedCert(cert);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Certificate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Generate Self-Signed Certificate
            </DialogTitle>
            <DialogDescription>
              Create a new certificate for signing documents. Self-signed certificates
              are suitable for internal use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commonName">Common Name *</Label>
              <Input
                id="commonName"
                placeholder="e.g., John Doe or Company Name"
                value={generateForm.commonName}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, commonName: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                The name that will appear on signed documents
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizationName">Organization *</Label>
              <Input
                id="organizationName"
                placeholder="e.g., Acme Corporation"
                value={generateForm.organizationName}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, organizationName: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="countryName">Country Code</Label>
                <Input
                  id="countryName"
                  placeholder="US"
                  maxLength={2}
                  value={generateForm.countryName}
                  onChange={(e) =>
                    setGenerateForm({
                      ...generateForm,
                      countryName: e.target.value.toUpperCase(),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validityDays">Validity Period</Label>
                <Select
                  value={generateForm.validityDays}
                  onValueChange={(value) =>
                    setGenerateForm({ ...generateForm, validityDays: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="365">1 Year</SelectItem>
                    <SelectItem value="730">2 Years</SelectItem>
                    <SelectItem value="1095">3 Years</SelectItem>
                    <SelectItem value="1825">5 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailAddress">Email Address (Optional)</Label>
              <Input
                id="emailAddress"
                type="email"
                placeholder="signer@company.com"
                value={generateForm.emailAddress}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, emailAddress: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateCertificate}
              disabled={generating}
              className="gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Certificate Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => {
        setShowImportDialog(open);
        if (!open) {
          setValidationResult(null);
          setImportForm({
            name: "",
            certificate: "",
            privateKey: "",
            privateKeyPassword: "",
            certificateChain: "",
            caBundle: "",
          });
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import CA-Issued Certificate
            </DialogTitle>
            <DialogDescription>
              Import a certificate from a trusted Certificate Authority (AATL/eIDAS) for production use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="certName" data-testid="label-cert-name">Certificate Name</Label>
            <Input
              id="certName"
              data-testid="input-cert-name"
              placeholder="e.g., Sectigo AATL Production Certificate"
              value={importForm.name}
              onChange={(e) =>
                setImportForm({ ...importForm, name: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this certificate. Defaults to the certificate CN if left blank.
            </p>
          </div>

          <Tabs defaultValue="certificate" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="certificate" data-testid="tab-certificate">Certificate</TabsTrigger>
              <TabsTrigger value="privateKey" data-testid="tab-private-key">Private Key</TabsTrigger>
              <TabsTrigger value="chain" data-testid="tab-chain">Chain</TabsTrigger>
              <TabsTrigger value="caBundle" data-testid="tab-ca-bundle">CA Bundle</TabsTrigger>
            </TabsList>
            <TabsContent value="certificate" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Leaf Certificate (PEM format)</Label>
                <Textarea
                  data-testid="textarea-certificate"
                  placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
                  className="font-mono text-xs h-48"
                  value={importForm.certificate}
                  onChange={(e) =>
                    setImportForm({ ...importForm, certificate: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Your end-entity (leaf) certificate issued by the CA.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleValidateCertificate}
                disabled={validating || !importForm.certificate}
                className="gap-2"
                data-testid="button-validate-cert"
              >
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Validate Certificate
                  </>
                )}
              </Button>
            </TabsContent>
            <TabsContent value="privateKey" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Private Key (PEM format)</Label>
                <Textarea
                  data-testid="textarea-private-key"
                  placeholder="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----

or

-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
                  className="font-mono text-xs h-48"
                  value={importForm.privateKey}
                  onChange={(e) =>
                    setImportForm({ ...importForm, privateKey: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key Password (if encrypted)</Label>
                <div className="relative">
                  <Input
                    data-testid="input-private-key-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Leave empty if not encrypted"
                    value={importForm.privateKeyPassword}
                    onChange={(e) =>
                      setImportForm({ ...importForm, privateKeyPassword: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="chain" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Certificate Chain (Optional)</Label>
                <Textarea
                  data-testid="textarea-chain"
                  placeholder="Paste intermediate and root CA certificates here (PEM format).
Multiple certificates can be concatenated."
                  className="font-mono text-xs h-48"
                  value={importForm.certificateChain}
                  onChange={(e) =>
                    setImportForm({ ...importForm, certificateChain: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Include intermediate certificates for chain validation. If using CA Bundle tab, this can be left empty.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="caBundle" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>CA Bundle (AATL/eIDAS)</Label>
                <Textarea
                  data-testid="textarea-ca-bundle"
                  placeholder="Paste the full CA bundle PEM here.
This typically contains intermediate CAs and the root CA certificate concatenated together.

-----BEGIN CERTIFICATE-----
(Intermediate CA)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
(Root CA)
-----END CERTIFICATE-----"
                  className="font-mono text-xs h-48"
                  value={importForm.caBundle}
                  onChange={(e) =>
                    setImportForm({ ...importForm, caBundle: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The CA bundle contains intermediate and root certificates needed for Adobe AATL trust verification.
                  This is typically provided by your CA (e.g., Sectigo, DigiCert, GlobalSign).
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Validation Result */}
          {validationResult && (
            <Card className={cn(
              "mt-4",
              validationResult.isValid
                ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                : "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
            )}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  {validationResult.isValid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-2">
                    <p className={cn(
                      "font-medium",
                      validationResult.isValid
                        ? "text-green-900 dark:text-green-100"
                        : "text-red-900 dark:text-red-100"
                    )}>
                      {validationResult.isValid
                        ? "Certificate is valid"
                        : "Certificate validation failed"}
                    </p>
                    {validationResult.errors.length > 0 && (
                      <ul className="text-sm text-red-700 dark:text-red-300 list-disc pl-4">
                        {validationResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                    {validationResult.warnings.length > 0 && (
                      <ul className="text-sm text-yellow-700 dark:text-yellow-300 list-disc pl-4">
                        {validationResult.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    )}
                    {validationResult.isValid && (
                      <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                        <p>
                          <strong>Subject:</strong> {validationResult.subject.commonName} ({validationResult.subject.organizationName})
                        </p>
                        <p>
                          <strong>Issuer:</strong> {validationResult.issuer.commonName}
                        </p>
                        <p>
                          <strong>Valid:</strong> {formatDate(validationResult.validFrom)} - {formatDate(validationResult.validTo)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportCertificate}
              disabled={importing || !importForm.certificate || !importForm.privateKey}
              className="gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import Certificate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Certificate Details
            </DialogTitle>
          </DialogHeader>
          {selectedCert && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Label className="text-xs text-muted-foreground">Common Name</Label>
                    <p className="font-medium">{selectedCert.subject.commonName}</p>
                  </div>
                  <div className="flex gap-1">
                    {selectedCert.isDefault && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Star className="h-3 w-3 fill-current" />
                        Default
                      </Badge>
                    )}
                    {selectedCert.isSelfSigned ? (
                      <Badge variant="outline" className="text-xs">Self-signed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        CA-issued
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Organization</Label>
                  <p>{selectedCert.subject.organizationName}</p>
                </div>

                {selectedCert.subject.emailAddress && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p>{selectedCert.subject.emailAddress}</p>
                  </div>
                )}

                {selectedCert.subject.countryName && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Country</Label>
                    <p>{selectedCert.subject.countryName}</p>
                  </div>
                )}

                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground">Issuer</Label>
                  <p>{selectedCert.issuer.commonName} ({selectedCert.issuer.organizationName})</p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Valid From</Label>
                    <p className="text-sm">{formatDate(selectedCert.validFrom)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valid To</Label>
                    <p className={cn(
                      "text-sm",
                      selectedCert.isExpired && "text-red-600 font-medium"
                    )}>
                      {formatDate(selectedCert.validTo)}
                      {selectedCert.isExpired && " (Expired)"}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground">Serial Number</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {selectedCert.serialNumber}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(selectedCert.serialNumber, "Serial number")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <Label className="text-xs text-muted-foreground">SHA-256 Fingerprint</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {selectedCert.fingerprint.substring(0, 32)}...
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(selectedCert.fingerprint, "Fingerprint")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
                  <Lock className="h-4 w-4" />
                  <span>
                    {selectedCert.chainValidated
                      ? "Certificate chain validated"
                      : selectedCert.hasChain
                      ? "Chain present but not fully validated"
                      : "No certificate chain"}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Certificate
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this certificate? This action cannot be undone.
              Documents signed with this certificate will still be valid, but you won't be able
              to use this certificate for new signatures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedCert && (
            <div className="bg-muted/50 rounded-lg p-3 my-2">
              <p className="font-medium">{selectedCert.subject.commonName}</p>
              <p className="text-sm text-muted-foreground">
                {selectedCert.subject.organizationName}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCertificate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Certificate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

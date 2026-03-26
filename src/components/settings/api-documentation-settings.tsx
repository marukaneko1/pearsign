"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Copy,
  Check,
  Code,
  Key,
  FileText,
  Send,
  Database,
  AlertCircle,
  ExternalLink,
  Layers,
  Zap,
  Shield,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApiPlayground } from "./api-playground";

// Code block component with copy functionality
function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg text-sm overflow-x-auto border border-zinc-800">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4 text-zinc-400" />
        )}
      </Button>
    </div>
  );
}

// Endpoint documentation component
function EndpointDoc({
  method,
  path,
  description,
  permissions,
  requestExample,
  responseExample,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  permissions: string[];
  requestExample?: string;
  responseExample: string;
}) {
  const methodColors = {
    GET: "bg-green-500/10 text-green-600 border-green-500/20",
    POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    PATCH: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    DELETE: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  return (
    <AccordionItem value={`${method}-${path}`} className="border rounded-lg mb-2 bg-card">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`${methodColors[method]} font-mono text-xs`}>
            {method}
          </Badge>
          <code className="text-sm font-mono">{path}</code>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Required permissions:</span>
          {permissions.map((perm) => (
            <Badge key={perm} variant="secondary" className="text-xs font-mono">
              {perm}
            </Badge>
          ))}
        </div>

        {requestExample && (
          <div className="mb-4">
            <h5 className="text-sm font-medium mb-2">Request Body</h5>
            <CodeBlock code={requestExample} />
          </div>
        )}

        <div>
          <h5 className="text-sm font-medium mb-2">Response</h5>
          <CodeBlock code={responseExample} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function ApiDocumentationSettings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[hsl(var(--pearsign-primary))]" />
            API Documentation
          </h2>
          <p className="text-muted-foreground mt-1">
            Developer reference for the PearSign API. Read-only documentation for integrating with CRM systems.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            OpenAPI Spec
          </a>
        </Button>
      </div>

      {/* Quick Start Card */}
      <Card className="border-[hsl(var(--pearsign-primary))]/20 bg-[hsl(var(--pearsign-primary))]/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
            Quick Start
          </CardTitle>
          <CardDescription>
            Send your first document in 3 steps
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[hsl(var(--pearsign-primary))] text-white flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h4 className="font-medium text-sm">Get API Key</h4>
                <p className="text-xs text-muted-foreground">
                  Create a live API key in the API Keys section
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[hsl(var(--pearsign-primary))] text-white flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="font-medium text-sm">Get Template Schema</h4>
                <p className="text-xs text-muted-foreground">
                  Fetch field IDs from your template
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[hsl(var(--pearsign-primary))] text-white flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h4 className="font-medium text-sm">Send Envelope</h4>
                <p className="text-xs text-muted-foreground">
                  POST to /envelopes/send with field values
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Documentation Tabs */}
      <Tabs defaultValue="playground" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="playground" className="gap-2">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Playground</span>
          </TabsTrigger>
          <TabsTrigger value="authentication" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">Auth</span>
          </TabsTrigger>
          <TabsTrigger value="field-mapping" className="gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Fields</span>
          </TabsTrigger>
          <TabsTrigger value="endpoints" className="gap-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">Endpoints</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Errors</span>
          </TabsTrigger>
          <TabsTrigger value="examples" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Examples</span>
          </TabsTrigger>
        </TabsList>

        {/* API Playground Tab */}
        <TabsContent value="playground" className="space-y-4">
          <Card className="border-[hsl(var(--pearsign-primary))]/20 bg-[hsl(var(--pearsign-primary))]/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 text-[hsl(var(--pearsign-primary))]" />
                API Playground
              </CardTitle>
              <CardDescription>
                Test API endpoints directly in your browser. Enter your API key and send real requests.
              </CardDescription>
            </CardHeader>
          </Card>
          <ApiPlayground />
        </TabsContent>

        {/* Authentication Tab */}
        <TabsContent value="authentication" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Authentication
              </CardTitle>
              <CardDescription>
                All API requests require authentication using an API key
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Authorization Header</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Include your API key in the <code className="bg-muted px-1 py-0.5 rounded">Authorization</code> header:
                </p>
                <CodeBlock code={`Authorization: Bearer ps_live_xxx.your_secret_here`} language="bash" />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">API Key Format</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 mt-0.5">ps_live_</Badge>
                    <span>Production keys for live transactions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 mt-0.5">ps_test_</Badge>
                    <span>Test keys for development (isolated environment)</span>
                  </li>
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Rate Limiting</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  API requests are rate limited per API key. Rate limit headers are included in all responses:
                </p>
                <CodeBlock code={`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200`} language="bash" />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Example Request</h4>
                <CodeBlock code={`curl -X GET "https://your-domain.com/api/v1/templates" \\
  -H "Authorization: Bearer ps_live_abc123.your_secret_here" \\
  -H "Content-Type: application/json"`} language="bash" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Field Mapping Tab - CRITICAL for CRM integrations */}
        <TabsContent value="field-mapping" className="space-y-4">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" />
                Important: Understanding Field Mapping
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                <strong>Field mapping is position-independent.</strong> The visual placement of fields on a document is
                irrelevant for API integration. CRMs map data using <code className="bg-muted px-1 py-0.5 rounded">fieldId</code>,
                not coordinates.
              </p>
              <p>
                <strong>Templates must be finalized before API use.</strong> Create and configure your template in the
                PearSign UI first, then use the API to fetch the field schema and send documents.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Field Schema
              </CardTitle>
              <CardDescription>
                Every field has a stable, immutable identifier for API mapping
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Field Identifiers</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>
                    <code className="bg-muted px-1 py-0.5 rounded">fieldId</code> - System-generated, immutable identifier (e.g., <code className="bg-muted px-1 py-0.5 rounded">fld_abc123_xyz789</code>)
                  </li>
                  <li>
                    <code className="bg-muted px-1 py-0.5 rounded">fieldName</code> - Human-readable name, editable by template creator
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Always use <code className="bg-muted px-1 py-0.5 rounded">fieldId</code> for API mapping.</strong> The
                  <code className="bg-muted px-1 py-0.5 rounded">fieldName</code> is also accepted but may change.
                </p>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Fetching Template Field Schema</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Get the field schema for a template to understand what fields are available:
                </p>
                <CodeBlock code={`GET /api/v1/templates/{templateId}/fields

Response:
{
  "data": {
    "templateId": "tmpl_abc123",
    "name": "Employment Contract",
    "signerRoles": [
      { "roleId": "signer-1", "name": "Employee", "order": 1 },
      { "roleId": "signer-2", "name": "HR Manager", "order": 2 }
    ],
    "fields": [
      {
        "fieldId": "fld_name_001",
        "fieldName": "employee_name",
        "type": "text",
        "required": true,
        "roleId": "signer-1",
        "roleName": "Employee"
      },
      {
        "fieldId": "fld_email_002",
        "fieldName": "employee_email",
        "type": "email",
        "required": true,
        "roleId": "signer-1",
        "roleName": "Employee"
      },
      {
        "fieldId": "fld_sig_003",
        "fieldName": "employee_signature",
        "type": "signature",
        "required": true,
        "roleId": "signer-1",
        "roleName": "Employee"
      }
    ]
  }
}`} />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Field Types</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {["signature", "initials", "text", "email", "date", "number", "checkbox", "company", "address", "phone", "upload"].map((type) => (
                    <Badge key={type} variant="outline" className="justify-center py-1.5 font-mono text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Pre-populating Fields at Send Time</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  When sending an envelope, include <code className="bg-muted px-1 py-0.5 rounded">fieldValues</code> to pre-fill fields:
                </p>
                <CodeBlock code={`POST /api/v1/envelopes/send
{
  "templateId": "tmpl_abc123",
  "recipients": [
    { "email": "john@example.com", "name": "John Doe", "roleId": "signer-1" }
  ],
  "fieldValues": {
    "fld_name_001": "John Doe",
    "fld_email_002": "john@example.com"
  }
}`} />
                <p className="text-sm text-muted-foreground mt-3">
                  <strong>Note:</strong> You can use either <code className="bg-muted px-1 py-0.5 rounded">fieldId</code> or
                  <code className="bg-muted px-1 py-0.5 rounded">fieldName</code> as keys. Signature fields cannot be pre-populated.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CRM Integration Flow</CardTitle>
              <CardDescription>
                Recommended flow for integrating PearSign with your CRM
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pearsign-primary))] text-white text-xs font-bold">1</span>
                  <div>
                    <h5 className="font-medium">Create Template in PearSign UI</h5>
                    <p className="text-muted-foreground">
                      Upload your PDF and place signature fields visually. Set field names that match your CRM data.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pearsign-primary))] text-white text-xs font-bold">2</span>
                  <div>
                    <h5 className="font-medium">Activate Template</h5>
                    <p className="text-muted-foreground">
                      Mark the template as "Active" to enable API usage.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pearsign-primary))] text-white text-xs font-bold">3</span>
                  <div>
                    <h5 className="font-medium">Fetch Field Schema</h5>
                    <p className="text-muted-foreground">
                      Call <code className="bg-muted px-1 py-0.5 rounded">GET /api/v1/templates/{"{"} templateId{"}"}/fields</code> to get field IDs.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pearsign-primary))] text-white text-xs font-bold">4</span>
                  <div>
                    <h5 className="font-medium">Map CRM Fields to PearSign Fields</h5>
                    <p className="text-muted-foreground">
                      In your CRM, create a mapping between CRM field names and PearSign <code className="bg-muted px-1 py-0.5 rounded">fieldId</code> values.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pearsign-primary))] text-white text-xs font-bold">5</span>
                  <div>
                    <h5 className="font-medium">Send Documents via API</h5>
                    <p className="text-muted-foreground">
                      Call <code className="bg-muted px-1 py-0.5 rounded">POST /api/v1/envelopes/send</code> with your template ID, recipients, and field values.
                    </p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Envelopes
              </CardTitle>
              <CardDescription>Create, send, and manage signature envelopes</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="space-y-2">
                <EndpointDoc
                  method="GET"
                  path="/api/v1/envelopes"
                  description="List all envelopes for your organization"
                  permissions={["envelopes:read"]}
                  responseExample={`{
  "data": [
    {
      "id": "env-123456789",
      "name": "Employment Contract",
      "status": "completed",
      "createdAt": "2026-01-10T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "count": 1 }
}`}
                />
                <EndpointDoc
                  method="POST"
                  path="/api/v1/envelopes/send"
                  description="Create and send an envelope from a template with pre-populated field values. This is the primary endpoint for CRM integrations."
                  permissions={["envelopes:create", "envelopes:send"]}
                  requestExample={`{
  "templateId": "tmpl_abc123",
  "recipients": [
    {
      "email": "john@example.com",
      "name": "John Doe",
      "roleId": "signer-1"
    }
  ],
  "fieldValues": {
    "fld_name_001": "John Doe",
    "fld_company_002": "Acme Corp"
  },
  "options": {
    "title": "Employment Contract - John Doe",
    "message": "Please review and sign",
    "expirationDays": 30
  }
}`}
                  responseExample={`{
  "success": true,
  "data": {
    "envelopeId": "env-123456789",
    "title": "Employment Contract - John Doe",
    "status": "in_signing",
    "fieldCount": 5,
    "prefilledFieldCount": 2
  }
}`}
                />
                <EndpointDoc
                  method="GET"
                  path="/api/v1/envelopes/{id}/fields"
                  description="Get current field values for an envelope"
                  permissions={["envelopes:read"]}
                  responseExample={`{
  "data": {
    "envelopeId": "env-123456789",
    "fields": [
      {
        "fieldId": "fld_name_001",
        "fieldName": "employee_name",
        "type": "text",
        "required": true,
        "currentValue": "John Doe"
      }
    ]
  }
}`}
                />
                <EndpointDoc
                  method="POST"
                  path="/api/v1/envelopes/{id}/fields"
                  description="Update field values on an existing envelope (before signing)"
                  permissions={["envelopes:write"]}
                  requestExample={`{
  "fieldValues": {
    "fld_name_001": "Jane Doe",
    "fld_company_002": "Updated Corp"
  }
}`}
                  responseExample={`{
  "success": true,
  "data": {
    "envelopeId": "env-123456789",
    "updatedFields": 2
  }
}`}
                />
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Templates
              </CardTitle>
              <CardDescription>Manage reusable document templates</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="space-y-2">
                <EndpointDoc
                  method="GET"
                  path="/api/v1/templates"
                  description="List all templates with optional field schemas"
                  permissions={["templates:read"]}
                  responseExample={`{
  "data": [
    {
      "id": "tmpl_abc123",
      "name": "Employment Contract",
      "status": "active",
      "fieldCount": 5,
      "signerRoles": [
        { "roleId": "signer-1", "name": "Employee" }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}`}
                />
                <EndpointDoc
                  method="GET"
                  path="/api/v1/templates/{id}/fields"
                  description="Get the field schema for a template. Use this to understand available fields before sending."
                  permissions={["templates:read"]}
                  responseExample={`{
  "data": {
    "templateId": "tmpl_abc123",
    "name": "Employment Contract",
    "status": "active",
    "signerRoles": [
      { "roleId": "signer-1", "name": "Employee", "order": 1 }
    ],
    "fields": [
      {
        "fieldId": "fld_name_001",
        "fieldName": "employee_name",
        "type": "text",
        "required": true,
        "roleId": "signer-1",
        "roleName": "Employee"
      }
    ]
  }
}`}
                />
                <EndpointDoc
                  method="GET"
                  path="/api/v1/templates/{id}"
                  description="Get full template details including field schema"
                  permissions={["templates:read"]}
                  responseExample={`{
  "data": {
    "id": "tmpl_abc123",
    "name": "Employment Contract",
    "description": "Standard employment agreement",
    "status": "active",
    "useCount": 42,
    "hasDocument": true,
    "fields": [...]
  }
}`}
                />
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Documents
              </CardTitle>
              <CardDescription>View documents and their field schemas</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="space-y-2">
                <EndpointDoc
                  method="GET"
                  path="/api/v1/documents"
                  description="List all documents with field counts"
                  permissions={["documents:read"]}
                  responseExample={`{
  "data": [
    {
      "documentId": "doc_xyz789",
      "envelopeId": "env-123456789",
      "title": "Employment Contract",
      "status": "completed",
      "fieldCount": 5
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}`}
                />
                <EndpointDoc
                  method="GET"
                  path="/api/v1/documents/{id}/fields"
                  description="Get field schema for a specific document"
                  permissions={["documents:read"]}
                  responseExample={`{
  "data": {
    "documentId": "doc_xyz789",
    "envelopeId": "env-123456789",
    "title": "Employment Contract",
    "fields": [
      {
        "fieldId": "fld_name_001",
        "fieldName": "employee_name",
        "type": "text",
        "currentValue": "John Doe"
      }
    ]
  }
}`}
                />
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Error Codes
              </CardTitle>
              <CardDescription>
                All errors follow a consistent format with actionable error codes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Error Response Format</h4>
                <CodeBlock code={`{
  "error": {
    "code": "error_code",
    "message": "Human-readable error message",
    "details": { /* additional context */ }
  }
}`} />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">HTTP Status Codes</h4>
                <div className="space-y-2">
                  {[
                    { code: "400", label: "Bad Request", desc: "Invalid request parameters" },
                    { code: "401", label: "Unauthorized", desc: "Missing or invalid API key" },
                    { code: "403", label: "Forbidden", desc: "Insufficient permissions" },
                    { code: "404", label: "Not Found", desc: "Resource not found" },
                    { code: "429", label: "Rate Limited", desc: "Too many requests" },
                    { code: "500", label: "Internal Error", desc: "Server error" },
                  ].map(({ code, label, desc }) => (
                    <div key={code} className="flex items-center gap-3 text-sm">
                      <Badge variant="outline" className="font-mono">{code}</Badge>
                      <span className="font-medium w-32">{label}</span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">Field Validation Errors</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  When field values fail validation, you'll receive detailed errors:
                </p>
                <CodeBlock code={`{
  "success": false,
  "error": {
    "code": "field_validation_failed",
    "message": "One or more field values failed validation",
    "details": [
      {
        "code": "FIELD_NOT_FOUND",
        "fieldId": "unknown_field",
        "message": "Field 'unknown_field' does not exist in template schema"
      },
      {
        "code": "FIELD_TYPE_MISMATCH",
        "fieldId": "fld_email_001",
        "fieldName": "employee_email",
        "message": "Field 'employee_email' expects email string, got number",
        "expectedType": "email",
        "receivedType": "number"
      },
      {
        "code": "REQUIRED_FIELD_MISSING",
        "fieldId": "fld_name_001",
        "fieldName": "employee_name",
        "message": "Required field 'employee_name' is missing"
      }
    ]
  }
}`} />
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">Validation Error Codes</h4>
                <div className="space-y-2">
                  {[
                    { code: "FIELD_NOT_FOUND", desc: "The specified fieldId doesn't exist in the schema" },
                    { code: "FIELD_TYPE_MISMATCH", desc: "Value type doesn't match expected field type" },
                    { code: "REQUIRED_FIELD_MISSING", desc: "A required field was not provided" },
                    { code: "VALIDATION_FAILED", desc: "Value failed custom validation (regex, email format, etc.)" },
                    { code: "INVALID_VALUE", desc: "Value format is incorrect" },
                  ].map(({ code, desc }) => (
                    <div key={code} className="flex items-start gap-3 text-sm">
                      <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono shrink-0">{code}</code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Examples Tab */}
        <TabsContent value="examples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Complete CRM Integration Example</CardTitle>
              <CardDescription>
                End-to-end example of sending a document from your CRM
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Step 1: Fetch Template Schema</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  First, get the field schema for your template:
                </p>
                <CodeBlock code={`curl -X GET "https://your-domain.com/api/v1/templates/tmpl_abc123/fields" \\
  -H "Authorization: Bearer ps_live_xxx.your_secret"

# Response includes all field IDs you'll need for mapping`} language="bash" />
              </div>

              <div>
                <h4 className="font-medium mb-2">Step 2: Send Document with Field Values</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Send the envelope with your CRM data:
                </p>
                <CodeBlock code={`curl -X POST "https://your-domain.com/api/v1/envelopes/send" \\
  -H "Authorization: Bearer ps_live_xxx.your_secret" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "tmpl_abc123",
    "recipients": [
      {
        "email": "john.doe@example.com",
        "name": "John Doe",
        "roleId": "signer-1"
      },
      {
        "email": "hr@company.com",
        "name": "HR Manager",
        "roleId": "signer-2"
      }
    ],
    "fieldValues": {
      "fld_name_001": "John Doe",
      "fld_email_002": "john.doe@example.com",
      "fld_company_003": "Acme Corporation",
      "fld_start_date_004": "2026-02-01",
      "fld_salary_005": "75000"
    },
    "options": {
      "title": "Employment Contract - John Doe",
      "message": "Please review and sign your employment contract.",
      "expirationDays": 14,
      "enableReminders": true
    }
  }'`} language="bash" />
              </div>

              <div>
                <h4 className="font-medium mb-2">Step 3: Check Envelope Status</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Optionally, poll for status or set up webhooks:
                </p>
                <CodeBlock code={`curl -X GET "https://your-domain.com/api/v1/envelopes/env-123456789" \\
  -H "Authorization: Bearer ps_live_xxx.your_secret"

# Response:
{
  "data": {
    "id": "env-123456789",
    "status": "in_signing",
    "recipients": [
      { "email": "john.doe@example.com", "status": "pending" },
      { "email": "hr@company.com", "status": "waiting" }
    ]
  }
}`} language="bash" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>JavaScript/Node.js Example</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={`// PearSign API Client Example
const API_KEY = 'ps_live_xxx.your_secret';
const BASE_URL = 'https://your-domain.com/api/v1';

async function sendContract(templateId, recipientData, fieldValues) {
  const response = await fetch(\`\${BASE_URL}/envelopes/send\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      templateId,
      recipients: [
        {
          email: recipientData.email,
          name: recipientData.name,
          roleId: 'signer-1',
        },
      ],
      fieldValues,
      options: {
        title: \`Contract - \${recipientData.name}\`,
        expirationDays: 30,
      },
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to send envelope');
  }

  return data.data.envelopeId;
}

// Usage
const envelopeId = await sendContract(
  'tmpl_abc123',
  { email: 'john@example.com', name: 'John Doe' },
  {
    'fld_name_001': 'John Doe',
    'fld_company_002': 'Acme Corp',
  }
);

console.log(\`Envelope sent: \${envelopeId}\`);`} language="javascript" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Python Example</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={`import requests

API_KEY = 'ps_live_xxx.your_secret'
BASE_URL = 'https://your-domain.com/api/v1'

def send_contract(template_id, recipient, field_values):
    """Send a document for signature via PearSign API."""

    response = requests.post(
        f'{BASE_URL}/envelopes/send',
        headers={
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json',
        },
        json={
            'templateId': template_id,
            'recipients': [
                {
                    'email': recipient['email'],
                    'name': recipient['name'],
                    'roleId': 'signer-1',
                }
            ],
            'fieldValues': field_values,
            'options': {
                'title': f"Contract - {recipient['name']}",
                'expirationDays': 30,
            },
        },
    )

    data = response.json()

    if not data.get('success'):
        raise Exception(data.get('error', {}).get('message', 'Failed to send'))

    return data['data']['envelopeId']

# Usage
envelope_id = send_contract(
    'tmpl_abc123',
    {'email': 'john@example.com', 'name': 'John Doe'},
    {
        'fld_name_001': 'John Doe',
        'fld_company_002': 'Acme Corp',
    }
)

print(f'Envelope sent: {envelope_id}')`} language="python" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <Card className="bg-muted/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            <strong>Need help?</strong> Contact our developer support team.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer" className="gap-2">
                <Code className="h-4 w-4" />
                OpenAPI Spec
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

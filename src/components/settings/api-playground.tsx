"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Play,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Key,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  FolderOpen,
  Save,
  BookmarkPlus,
  Workflow,
  ArrowRight,
  Star,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Type for API endpoint params
interface EndpointParam {
  name: string;
  type: "query" | "path";
  default: string;
  description: string;
  required?: boolean;
}

interface ApiEndpoint {
  id: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  permissions: string[];
  params: EndpointParam[];
  bodyTemplate: string | null;
}

// API Endpoint definitions
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "list-templates",
    name: "List Templates",
    method: "GET",
    path: "/api/v1/templates",
    description: "Get all templates for your organization",
    permissions: ["templates:read"],
    params: [
      { name: "page", type: "query", default: "1", description: "Page number" },
      { name: "limit", type: "query", default: "20", description: "Items per page" },
      { name: "includeFields", type: "query", default: "false", description: "Include field schemas" },
    ],
    bodyTemplate: null,
  },
  {
    id: "get-template",
    name: "Get Template",
    method: "GET",
    path: "/api/v1/templates/{id}",
    description: "Get a single template by ID",
    permissions: ["templates:read"],
    params: [
      { name: "id", type: "path", default: "", description: "Template ID", required: true },
    ],
    bodyTemplate: null,
  },
  {
    id: "get-template-fields",
    name: "Get Template Fields",
    method: "GET",
    path: "/api/v1/templates/{id}/fields",
    description: "Get field schema for a template (for CRM mapping)",
    permissions: ["templates:read"],
    params: [
      { name: "id", type: "path", default: "", description: "Template ID", required: true },
    ],
    bodyTemplate: null,
  },
  {
    id: "list-envelopes",
    name: "List Envelopes",
    method: "GET",
    path: "/api/v1/envelopes",
    description: "Get all envelopes for your organization",
    permissions: ["envelopes:read"],
    params: [
      { name: "page", type: "query", default: "1", description: "Page number" },
      { name: "limit", type: "query", default: "20", description: "Items per page" },
    ],
    bodyTemplate: null,
  },
  {
    id: "send-envelope",
    name: "Send Envelope",
    method: "POST",
    path: "/api/v1/envelopes/send",
    description: "Create and send an envelope from a template",
    permissions: ["envelopes:create", "envelopes:send"],
    params: [],
    bodyTemplate: `{
  "templateId": "YOUR_TEMPLATE_ID",
  "recipients": [
    {
      "email": "recipient@example.com",
      "name": "John Doe",
      "roleId": "signer-1"
    }
  ],
  "fieldValues": {
    "field_id_1": "Value 1",
    "field_id_2": "Value 2"
  },
  "options": {
    "title": "Document Title",
    "message": "Please sign this document",
    "expirationDays": 30
  }
}`,
  },
  {
    id: "get-envelope-fields",
    name: "Get Envelope Fields",
    method: "GET",
    path: "/api/v1/envelopes/{id}/fields",
    description: "Get current field values for an envelope",
    permissions: ["envelopes:read"],
    params: [
      { name: "id", type: "path", default: "", description: "Envelope ID", required: true },
    ],
    bodyTemplate: null,
  },
  {
    id: "update-envelope-fields",
    name: "Update Envelope Fields",
    method: "POST",
    path: "/api/v1/envelopes/{id}/fields",
    description: "Update field values on an existing envelope",
    permissions: ["envelopes:write"],
    params: [
      { name: "id", type: "path", default: "", description: "Envelope ID", required: true },
    ],
    bodyTemplate: `{
  "fieldValues": {
    "field_id_1": "Updated Value 1",
    "field_id_2": "Updated Value 2"
  }
}`,
  },
  {
    id: "list-documents",
    name: "List Documents",
    method: "GET",
    path: "/api/v1/documents",
    description: "Get all documents for your organization",
    permissions: ["documents:read"],
    params: [
      { name: "page", type: "query", default: "1", description: "Page number" },
      { name: "limit", type: "query", default: "20", description: "Items per page" },
    ],
    bodyTemplate: null,
  },
  {
    id: "get-document-fields",
    name: "Get Document Fields",
    method: "GET",
    path: "/api/v1/documents/{id}/fields",
    description: "Get field schema for a document",
    permissions: ["documents:read"],
    params: [
      { name: "id", type: "path", default: "", description: "Document/Envelope ID", required: true },
    ],
    bodyTemplate: null,
  },
  {
    id: "api-stats",
    name: "Get API Stats",
    method: "GET",
    path: "/api/v1/audit/stats",
    description: "Get API usage statistics",
    permissions: ["audit:read"],
    params: [
      { name: "days", type: "query", default: "30", description: "Number of days" },
    ],
    bodyTemplate: null,
  },
];

interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
}

// Collection types
interface SavedRequest {
  id: string;
  name: string;
  description?: string;
  endpointId: string;
  params: Record<string, string>;
  body: string;
  createdAt: string;
}

interface Collection {
  id: string;
  name: string;
  description: string;
  icon: "workflow" | "star" | "folder";
  isBuiltIn: boolean;
  requests: SavedRequest[];
}

// Pre-built workflow collections
const BUILT_IN_COLLECTIONS: Collection[] = [
  {
    id: "crm-integration",
    name: "CRM Integration Workflow",
    description: "Complete flow for sending documents from your CRM",
    icon: "workflow",
    isBuiltIn: true,
    requests: [
      {
        id: "crm-1",
        name: "1. List Active Templates",
        description: "Get all active templates available for sending",
        endpointId: "list-templates",
        params: { page: "1", limit: "50", includeFields: "true" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "crm-2",
        name: "2. Get Template Field Schema",
        description: "Fetch field IDs for mapping CRM data",
        endpointId: "get-template-fields",
        params: { id: "YOUR_TEMPLATE_ID" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "crm-3",
        name: "3. Send Document with Fields",
        description: "Create and send envelope with pre-populated data",
        endpointId: "send-envelope",
        params: {},
        body: `{
  "templateId": "YOUR_TEMPLATE_ID",
  "recipients": [
    {
      "email": "customer@example.com",
      "name": "Customer Name",
      "roleId": "signer-1"
    }
  ],
  "fieldValues": {
    "customer_name": "John Doe",
    "company_name": "Acme Corp",
    "contract_date": "2026-01-15"
  },
  "options": {
    "title": "Contract for John Doe",
    "message": "Please review and sign this contract",
    "expirationDays": 30
  }
}`,
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "field-mapping",
    name: "Field Mapping Discovery",
    description: "Discover and map fields for templates and documents",
    icon: "workflow",
    isBuiltIn: true,
    requests: [
      {
        id: "fm-1",
        name: "1. List All Templates",
        description: "View available templates with field counts",
        endpointId: "list-templates",
        params: { page: "1", limit: "20", includeFields: "false" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "fm-2",
        name: "2. Get Template Details",
        description: "Get full template info including roles",
        endpointId: "get-template",
        params: { id: "YOUR_TEMPLATE_ID" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "fm-3",
        name: "3. Get Template Fields",
        description: "Get all field IDs and types for mapping",
        endpointId: "get-template-fields",
        params: { id: "YOUR_TEMPLATE_ID" },
        body: "",
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "envelope-management",
    name: "Envelope Management",
    description: "Monitor and update envelopes",
    icon: "workflow",
    isBuiltIn: true,
    requests: [
      {
        id: "em-1",
        name: "1. List Recent Envelopes",
        description: "Get list of envelopes with status",
        endpointId: "list-envelopes",
        params: { page: "1", limit: "20" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "em-2",
        name: "2. Get Envelope Fields",
        description: "Check current field values on envelope",
        endpointId: "get-envelope-fields",
        params: { id: "YOUR_ENVELOPE_ID" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "em-3",
        name: "3. Update Envelope Fields",
        description: "Update field values before signing",
        endpointId: "update-envelope-fields",
        params: { id: "YOUR_ENVELOPE_ID" },
        body: `{
  "fieldValues": {
    "field_id_1": "Updated Value",
    "field_id_2": "Another Update"
  }
}`,
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "api-monitoring",
    name: "API Usage Monitoring",
    description: "Check API usage and performance stats",
    icon: "star",
    isBuiltIn: true,
    requests: [
      {
        id: "am-1",
        name: "Get 7-Day Stats",
        description: "API usage for the past week",
        endpointId: "api-stats",
        params: { days: "7" },
        body: "",
        createdAt: new Date().toISOString(),
      },
      {
        id: "am-2",
        name: "Get 30-Day Stats",
        description: "API usage for the past month",
        endpointId: "api-stats",
        params: { days: "30" },
        body: "",
        createdAt: new Date().toISOString(),
      },
    ],
  },
];

const STORAGE_KEY = "pearsign_api_collections";

export function ApiPlayground() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [requestHistory, setRequestHistory] = useState<Array<{
    endpoint: string;
    method: string;
    path: string;
    status: number;
    timestamp: Date;
  }>>([]);

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeTab, setActiveTab] = useState<"builder" | "collections">("builder");
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveRequestName, setSaveRequestName] = useState("");
  const [saveRequestDesc, setSaveRequestDesc] = useState("");
  const [saveToCollectionId, setSaveToCollectionId] = useState("");
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");

  // Load collections from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Collection[];
        // Merge with built-in collections
        const userCollections = parsed.filter(c => !c.isBuiltIn);
        setCollections([...BUILT_IN_COLLECTIONS, ...userCollections]);
      } else {
        setCollections(BUILT_IN_COLLECTIONS);
      }
    } catch {
      setCollections(BUILT_IN_COLLECTIONS);
    }
  }, []);

  // Save collections to localStorage
  const saveCollections = useCallback((newCollections: Collection[]) => {
    const userCollections = newCollections.filter(c => !c.isBuiltIn);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userCollections));
    setCollections(newCollections);
  }, []);

  // Load a saved request into the builder
  const loadRequest = useCallback((request: SavedRequest) => {
    const endpoint = API_ENDPOINTS.find(e => e.id === request.endpointId);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      setParams(request.params);
      setRequestBody(request.body);
      setResponse(null);
      setActiveTab("builder");
      toast({ title: `Loaded: ${request.name}` });
    }
  }, [toast]);

  // Save current request to a collection
  const saveCurrentRequest = useCallback(() => {
    if (!saveRequestName.trim() || !saveToCollectionId) {
      toast({
        title: "Missing information",
        description: "Please provide a name and select a collection",
        variant: "destructive",
      });
      return;
    }

    const newRequest: SavedRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: saveRequestName.trim(),
      description: saveRequestDesc.trim() || undefined,
      endpointId: selectedEndpoint.id,
      params: { ...params },
      body: requestBody,
      createdAt: new Date().toISOString(),
    };

    const updatedCollections = collections.map(c => {
      if (c.id === saveToCollectionId) {
        return { ...c, requests: [...c.requests, newRequest] };
      }
      return c;
    });

    saveCollections(updatedCollections);
    setShowSaveDialog(false);
    setSaveRequestName("");
    setSaveRequestDesc("");
    toast({ title: "Request saved", description: `Added to collection` });
  }, [saveRequestName, saveRequestDesc, saveToCollectionId, selectedEndpoint, params, requestBody, collections, saveCollections, toast]);

  // Create new collection
  const createCollection = useCallback(() => {
    if (!newCollectionName.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a collection name",
        variant: "destructive",
      });
      return;
    }

    const newCollection: Collection = {
      id: `coll-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newCollectionName.trim(),
      description: newCollectionDesc.trim(),
      icon: "folder",
      isBuiltIn: false,
      requests: [],
    };

    saveCollections([...collections, newCollection]);
    setShowNewCollectionDialog(false);
    setNewCollectionName("");
    setNewCollectionDesc("");
    toast({ title: "Collection created" });
  }, [newCollectionName, newCollectionDesc, collections, saveCollections, toast]);

  // Delete a collection
  const deleteCollection = useCallback((collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    if (collection?.isBuiltIn) {
      toast({
        title: "Cannot delete",
        description: "Built-in collections cannot be deleted",
        variant: "destructive",
      });
      return;
    }

    const updatedCollections = collections.filter(c => c.id !== collectionId);
    saveCollections(updatedCollections);
    if (selectedCollection?.id === collectionId) {
      setSelectedCollection(null);
    }
    toast({ title: "Collection deleted" });
  }, [collections, selectedCollection, saveCollections, toast]);

  // Delete a request from a collection
  const deleteRequest = useCallback((collectionId: string, requestId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    if (collection?.isBuiltIn) {
      toast({
        title: "Cannot modify",
        description: "Built-in collections cannot be modified",
        variant: "destructive",
      });
      return;
    }

    const updatedCollections = collections.map(c => {
      if (c.id === collectionId) {
        return { ...c, requests: c.requests.filter(r => r.id !== requestId) };
      }
      return c;
    });

    saveCollections(updatedCollections);
    toast({ title: "Request deleted" });
  }, [collections, saveCollections, toast]);

  // Initialize params when endpoint changes
  const handleEndpointChange = useCallback((endpointId: string) => {
    const endpoint = API_ENDPOINTS.find(e => e.id === endpointId);
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      // Reset params with defaults
      const newParams: Record<string, string> = {};
      endpoint.params.forEach(p => {
        newParams[p.name] = p.default || "";
      });
      setParams(newParams);
      // Set body template if available
      setRequestBody(endpoint.bodyTemplate || "");
      setResponse(null);
    }
  }, []);

  // Build the full URL with path params replaced
  const buildUrl = useCallback(() => {
    let path = selectedEndpoint.path;

    // Replace path params
    selectedEndpoint.params
      .filter(p => p.type === "path")
      .forEach(p => {
        path = path.replace(`{${p.name}}`, params[p.name] || `{${p.name}}`);
      });

    // Build query string
    const queryParams = selectedEndpoint.params
      .filter(p => p.type === "query" && params[p.name])
      .map(p => `${p.name}=${encodeURIComponent(params[p.name])}`)
      .join("&");

    return queryParams ? `${path}?${queryParams}` : path;
  }, [selectedEndpoint, params]);

  // Execute the API request
  const executeRequest = async () => {
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your API key to make requests",
        variant: "destructive",
      });
      return;
    }

    // Validate required params
    const missingRequired = selectedEndpoint.params
      .filter(p => p.required && !params[p.name])
      .map(p => p.name);

    if (missingRequired.length > 0) {
      toast({
        title: "Missing Required Parameters",
        description: `Please fill in: ${missingRequired.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResponse(null);

    const url = buildUrl();
    const startTime = Date.now();

    try {
      const fetchOptions: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      };

      if (selectedEndpoint.method !== "GET" && requestBody) {
        try {
          // Validate JSON
          JSON.parse(requestBody);
          fetchOptions.body = requestBody;
        } catch {
          toast({
            title: "Invalid JSON",
            description: "Request body must be valid JSON",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      const res = await fetch(url, fetchOptions);
      const duration = Date.now() - startTime;

      // Extract headers
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let body: unknown;
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        body = await res.json();
      } else {
        body = await res.text();
      }

      const apiResponse: ApiResponse = {
        status: res.status,
        statusText: res.statusText,
        headers,
        body,
        duration,
      };

      setResponse(apiResponse);

      // Add to history
      setRequestHistory(prev => [
        {
          endpoint: selectedEndpoint.name,
          method: selectedEndpoint.method,
          path: url,
          status: res.status,
          timestamp: new Date(),
        },
        ...prev.slice(0, 9), // Keep last 10
      ]);

    } catch (error) {
      console.error("API request failed:", error);
      toast({
        title: "Request Failed",
        description: error instanceof Error ? error.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Copy response to clipboard
  const copyResponse = async () => {
    if (!response) return;
    await navigator.clipboard.writeText(JSON.stringify(response.body, null, 2));
    setCopied(true);
    toast({ title: "Response copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate curl command
  const generateCurl = () => {
    const url = `${window.location.origin}${buildUrl()}`;
    let curl = `curl -X ${selectedEndpoint.method} "${url}"`;
    curl += ` \\\n  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}"`;
    curl += ` \\\n  -H "Content-Type: application/json"`;

    if (selectedEndpoint.method !== "GET" && requestBody) {
      curl += ` \\\n  -d '${requestBody.replace(/\n/g, "").replace(/\s+/g, " ")}'`;
    }

    return curl;
  };

  const copyCurl = async () => {
    await navigator.clipboard.writeText(generateCurl());
    toast({ title: "cURL command copied to clipboard" });
  };

  const methodColors = {
    GET: "bg-green-500/10 text-green-600 border-green-500/20",
    POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    PATCH: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    DELETE: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  const statusColors = (status: number) => {
    if (status >= 200 && status < 300) return "text-green-600";
    if (status >= 400 && status < 500) return "text-yellow-600";
    return "text-red-600";
  };

  // Collection icon helper
  const getCollectionIcon = (icon: string) => {
    switch (icon) {
      case "workflow":
        return <Workflow className="h-4 w-4" />;
      case "star":
        return <Star className="h-4 w-4" />;
      default:
        return <FolderOpen className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* API Key Input */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4" />
                API Key
              </CardTitle>
              <CardDescription>
                Enter your API key to authenticate requests.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder="ps_live_xxx.your_secret_here"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
          {apiKey && (
            <p className="text-xs text-muted-foreground mt-2">
              {apiKey.startsWith("ps_live_") ? (
                <span className="text-green-600">Production key detected</span>
              ) : apiKey.startsWith("ps_test_") ? (
                <span className="text-yellow-600">Test key detected</span>
              ) : (
                <span className="text-red-600">Invalid key format</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Main Tabs: Builder vs Collections */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "builder" | "collections")}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="builder" className="gap-2">
              <Play className="h-4 w-4" />
              Request Builder
            </TabsTrigger>
            <TabsTrigger value="collections" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Collections
            </TabsTrigger>
          </TabsList>
          {activeTab === "builder" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
              className="gap-2"
            >
              <BookmarkPlus className="h-4 w-4" />
              Save Request
            </Button>
          )}
          {activeTab === "collections" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewCollectionDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Collection
            </Button>
          )}
        </div>

        {/* Collections Tab Content */}
        <TabsContent value="collections" className="space-y-4">
          {selectedCollection ? (
            // Show selected collection details
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCollection(null)}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </Button>
                    {getCollectionIcon(selectedCollection.icon)}
                    <div>
                      <CardTitle className="text-base">{selectedCollection.name}</CardTitle>
                      <CardDescription>{selectedCollection.description}</CardDescription>
                    </div>
                  </div>
                  {selectedCollection.isBuiltIn && (
                    <Badge variant="secondary">Built-in</Badge>
                  )}
                  {!selectedCollection.isBuiltIn && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCollection(selectedCollection.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedCollection.requests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>No saved requests in this collection</p>
                    <p className="text-sm">Save a request from the Request Builder</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCollection.requests.map((request, index) => {
                      const endpoint = API_ENDPOINTS.find(e => e.id === request.endpointId);
                      return (
                        <div
                          key={request.id}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {selectedCollection.isBuiltIn && (
                              <span className="text-xs text-muted-foreground font-mono w-6">
                                {index + 1}.
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className={`${methodColors[endpoint?.method || "GET"]} text-xs font-mono py-0 shrink-0`}
                            >
                              {endpoint?.method || "GET"}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{request.name}</p>
                              {request.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {request.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => loadRequest(request)}
                              className="h-8 gap-1"
                            >
                              <Play className="h-3 w-3" />
                              Load
                            </Button>
                            {!selectedCollection.isBuiltIn && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteRequest(selectedCollection.id, request.id)}
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedCollection.isBuiltIn && selectedCollection.requests.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <ArrowRight className="h-3 w-3" />
                      Click "Load" to open a request in the builder, then customize and run it
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            // Show all collections
            <div className="grid gap-4 md:grid-cols-2">
              {collections.map((collection) => (
                <Card
                  key={collection.id}
                  className="cursor-pointer hover:border-[hsl(var(--pearsign-primary))]/50 transition-colors"
                  onClick={() => setSelectedCollection(collection)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${collection.isBuiltIn ? 'bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))]' : 'bg-muted'}`}>
                          {getCollectionIcon(collection.icon)}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{collection.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {collection.requests.length} request{collection.requests.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      {collection.isBuiltIn && (
                        <Badge variant="secondary" className="text-xs">Built-in</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {collection.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Builder Tab Content */}
        <TabsContent value="builder">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Request Builder */}
            <Card className="lg:row-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Request Builder</CardTitle>
              </CardHeader>
          <CardContent className="space-y-4">
            {/* Endpoint Selector */}
            <div className="space-y-2">
              <Label>Endpoint</Label>
              <Select value={selectedEndpoint.id} onValueChange={handleEndpointChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_ENDPOINTS.map((endpoint) => (
                    <SelectItem key={endpoint.id} value={endpoint.id}>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`${methodColors[endpoint.method]} text-xs font-mono py-0`}
                        >
                          {endpoint.method}
                        </Badge>
                        <span>{endpoint.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{selectedEndpoint.description}</p>
            </div>

            {/* URL Preview */}
            <div className="space-y-2">
              <Label>URL</Label>
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md font-mono text-sm">
                <Badge
                  variant="outline"
                  className={`${methodColors[selectedEndpoint.method]} shrink-0`}
                >
                  {selectedEndpoint.method}
                </Badge>
                <span className="truncate">{buildUrl()}</span>
              </div>
            </div>

            {/* Parameters */}
            {selectedEndpoint.params.length > 0 && (
              <div className="space-y-3">
                <Label>Parameters</Label>
                {selectedEndpoint.params.map((param) => (
                  <div key={param.name} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{param.name}</span>
                      <Badge variant="outline" className="text-xs py-0">
                        {param.type}
                      </Badge>
                      {param.required && (
                        <Badge variant="destructive" className="text-xs py-0">
                          required
                        </Badge>
                      )}
                    </div>
                    <Input
                      placeholder={param.description}
                      value={params[param.name] || ""}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Request Body */}
            {selectedEndpoint.bodyTemplate && (
              <div className="space-y-2">
                <Label>Request Body (JSON)</Label>
                <Textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="font-mono text-sm min-h-[200px]"
                  placeholder="Enter JSON request body..."
                />
              </div>
            )}

            {/* Required Permissions */}
            <div className="space-y-2">
              <Label>Required Permissions</Label>
              <div className="flex flex-wrap gap-1">
                {selectedEndpoint.permissions.map((perm) => (
                  <Badge key={perm} variant="secondary" className="text-xs font-mono">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={executeRequest}
                disabled={loading || !apiKey}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Send Request
              </Button>
              <Button variant="outline" onClick={copyCurl} className="gap-2">
                <Copy className="h-4 w-4" />
                cURL
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Response Viewer */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Response</CardTitle>
              {response && (
                <div className="flex items-center gap-3 text-sm">
                  <span className={`font-mono font-bold ${statusColors(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {response.duration}ms
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {response ? (
              <div className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  {response.status >= 200 && response.status < 300 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">
                    {response.status >= 200 && response.status < 300 ? "Success" : "Error"}
                  </span>
                </div>

                {/* Response Body */}
                <div className="relative">
                  <ScrollArea className="h-[300px] rounded-lg border bg-zinc-950">
                    <pre className="p-4 text-sm text-zinc-100 font-mono">
                      {JSON.stringify(response.body, null, 2)}
                    </pre>
                  </ScrollArea>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyResponse}
                    className="absolute top-2 right-4 h-8 w-8 bg-zinc-800 hover:bg-zinc-700"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-zinc-400" />
                    )}
                  </Button>
                </div>

                {/* Response Headers (Collapsible) */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Response Headers
                  </summary>
                  <div className="mt-2 p-3 bg-muted rounded-md font-mono text-xs space-y-1">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Play className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">Send a request to see the response</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Request History</CardTitle>
              {requestHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRequestHistory([])}
                  className="h-7 text-xs gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {requestHistory.length > 0 ? (
              <ScrollArea className="h-[150px]">
                <div className="space-y-2">
                  {requestHistory.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm"
                    >
                      <Badge
                        variant="outline"
                        className={`${methodColors[item.method as keyof typeof methodColors]} text-xs font-mono py-0 shrink-0`}
                      >
                        {item.method}
                      </Badge>
                      <span className="truncate flex-1 font-mono text-xs">{item.path}</span>
                      <Badge
                        variant="outline"
                        className={`${
                          item.status >= 200 && item.status < 300
                            ? "bg-green-500/10 text-green-600"
                            : "bg-red-500/10 text-red-600"
                        } text-xs py-0`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-[100px] text-muted-foreground text-sm">
                No requests yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>
      </Tabs>

      {/* Save Request Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5" />
              Save Request to Collection
            </DialogTitle>
            <DialogDescription>
              Save the current request configuration for quick access later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Request Name</Label>
              <Input
                placeholder="e.g., Get Employee Contract Template"
                value={saveRequestName}
                onChange={(e) => setSaveRequestName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of what this request does"
                value={saveRequestDesc}
                onChange={(e) => setSaveRequestDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Save to Collection</Label>
              <Select value={saveToCollectionId} onValueChange={setSaveToCollectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a collection..." />
                </SelectTrigger>
                <SelectContent>
                  {collections.filter(c => !c.isBuiltIn).map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        {collection.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {collections.filter(c => !c.isBuiltIn).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No custom collections yet.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveDialog(false);
                      setShowNewCollectionDialog(true);
                    }}
                    className="text-[hsl(var(--pearsign-primary))] hover:underline"
                  >
                    Create one first
                  </button>
                </p>
              )}
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">Current Request</p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Badge variant="outline" className={`${methodColors[selectedEndpoint.method]} text-xs font-mono py-0`}>
                  {selectedEndpoint.method}
                </Badge>
                <span className="font-mono text-xs truncate">{buildUrl()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveCurrentRequest} className="gap-2">
              <Save className="h-4 w-4" />
              Save Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Collection Dialog */}
      <Dialog open={showNewCollectionDialog} onOpenChange={setShowNewCollectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Collection
            </DialogTitle>
            <DialogDescription>
              Create a collection to organize your saved API requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Collection Name</Label>
              <Input
                placeholder="e.g., Customer Onboarding"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Brief description of this collection"
                value={newCollectionDesc}
                onChange={(e) => setNewCollectionDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCollectionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createCollection} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

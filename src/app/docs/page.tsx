"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Book,
  Key,
  Play,
  Copy,
  Check,
  Code,
  Zap,
  Shield,
  Clock,
  AlertTriangle,
  Loader2,
  Send,
  FileJson,
  Terminal,
  Braces,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, EndpointSpec>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
}

interface EndpointSpec {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: ParameterSpec[];
  requestBody?: { required?: boolean; content: { "application/json": { schema: unknown; example?: unknown } } };
  responses: Record<string, unknown>;
}

interface ParameterSpec {
  name: string;
  in: "query" | "path" | "header";
  description?: string;
  required?: boolean;
  schema: { type: string; enum?: string[]; default?: unknown };
}

const methodColors: Record<string, string> = {
  GET: "bg-emerald-500",
  POST: "bg-blue-500",
  PUT: "bg-amber-500",
  PATCH: "bg-orange-500",
  DELETE: "bg-red-500",
};

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<OpenAPISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState<{ path: string; method: string; spec: EndpointSpec } | null>(null);
  const [tryItParams, setTryItParams] = useState<Record<string, string>>({});
  const [tryItBody, setTryItBody] = useState("");
  const [tryItResponse, setTryItResponse] = useState<{ status: number; headers: Record<string, string>; body: unknown; time: number } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/v1/openapi.json")
      .then((r) => r.json())
      .then(setSpec)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const executeRequest = useCallback(async () => {
    if (!selectedEndpoint) return;
    setExecuting(true);
    setTryItResponse(null);
    const startTime = Date.now();

    try {
      let url = `/api/v1${selectedEndpoint.path}`;
      for (const [key, value] of Object.entries(tryItParams)) {
        if (url.includes(`{${key}}`)) url = url.replace(`{${key}}`, encodeURIComponent(value));
      }
      const queryParams = new URLSearchParams();
      const pathParamNames = (selectedEndpoint.path.match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
      for (const [key, value] of Object.entries(tryItParams)) {
        if (!pathParamNames.includes(key) && value) queryParams.set(key, value);
      }
      const qs = queryParams.toString();
      if (qs) url += `?${qs}`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(url, {
        method: selectedEndpoint.method,
        headers,
        body: selectedEndpoint.method !== "GET" && tryItBody ? tryItBody : undefined,
      });

      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => (respHeaders[k] = v));
      const body = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();

      setTryItResponse({ status: response.status, headers: respHeaders, body, time: Date.now() - startTime });
    } catch (error) {
      setTryItResponse({ status: 0, headers: {}, body: { error: String(error) }, time: Date.now() - startTime });
    } finally {
      setExecuting(false);
    }
  }, [selectedEndpoint, tryItParams, tryItBody, apiKey]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateCurlCommand = useCallback(() => {
    if (!selectedEndpoint) return "";
    let url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1${selectedEndpoint.path}`;
    for (const [key, value] of Object.entries(tryItParams)) {
      if (url.includes(`{${key}}`)) url = url.replace(`{${key}}`, value || `:${key}`);
    }
    let curl = `curl -X ${selectedEndpoint.method} "${url}"`;
    if (apiKey) curl += ` \\\n  -H "Authorization: Bearer ${apiKey}"`;
    if (selectedEndpoint.method !== "GET") {
      curl += ` \\\n  -H "Content-Type: application/json"`;
      if (tryItBody) curl += ` \\\n  -d '${tryItBody}'`;
    }
    return curl;
  }, [selectedEndpoint, tryItParams, tryItBody, apiKey]);

  const selectEndpoint = (path: string, method: string, endpointSpec: EndpointSpec) => {
    setSelectedEndpoint({ path, method, spec: endpointSpec });
    setTryItParams({});
    setTryItBody("");
    setTryItResponse(null);
    if (method !== "GET" && endpointSpec.requestBody?.content["application/json"]?.example) {
      setTryItBody(JSON.stringify(endpointSpec.requestBody.content["application/json"].example, null, 2));
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!spec) return <div className="min-h-screen flex items-center justify-center"><AlertTriangle className="h-12 w-12 text-amber-500" /></div>;

  const endpointsByTag: Record<string, { path: string; method: string; spec: EndpointSpec }[]> = {};
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, endpointSpec] of Object.entries(methods)) {
      const tag = endpointSpec.tags?.[0] || "Other";
      if (!endpointsByTag[tag]) endpointsByTag[tag] = [];
      endpointsByTag[tag].push({ path, method: method.toUpperCase(), spec: endpointSpec });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
              <div className="flex items-center gap-3">
                <img src="/pearsign-logo.png" alt="PearSign" className="h-9 w-9 rounded-xl" />
                <div>
                  <h1 className="text-lg font-semibold">{spec.info.title}</h1>
                  <p className="text-xs text-muted-foreground">v{spec.info.version}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1"><Zap className="h-3 w-3" />OpenAPI 3.1</Badge>
              <Button variant="outline" size="sm" asChild>
                <a href="/api/v1/openapi.json" target="_blank"><FileJson className="h-4 w-4 mr-2" />Download Spec</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3">
            <div className="sticky top-24">
              <Card className="mb-6 border-[hsl(var(--pearsign-primary))]/20">
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" />Authentication</CardTitle></CardHeader>
                <CardContent>
                  <Input type="password" placeholder="ps_test_xxx.secret" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground mt-2">Enter your API key to try endpoints</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Endpoints</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Accordion type="multiple" className="w-full" defaultValue={Object.keys(endpointsByTag)}>
                    {Object.entries(endpointsByTag).map(([tag, endpoints]) => (
                      <AccordionItem key={tag} value={tag} className="border-b-0">
                        <AccordionTrigger className="px-4 py-2 text-sm hover:no-underline">{tag}<Badge variant="secondary" className="ml-2 text-xs">{endpoints.length}</Badge></AccordionTrigger>
                        <AccordionContent className="pb-0">
                          <div className="space-y-1 px-2 pb-2">
                            {endpoints.map((ep) => (
                              <button key={`${ep.method}-${ep.path}`} onClick={() => selectEndpoint(ep.path, ep.method, ep.spec)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method ? "bg-[hsl(var(--pearsign-primary))]/10 text-[hsl(var(--pearsign-primary))]" : "hover:bg-muted"}`}>
                                <Badge className={`${methodColors[ep.method]} text-white text-[10px] px-1.5 py-0 min-w-[45px] justify-center`}>{ep.method}</Badge>
                                <span className="truncate font-mono text-xs">{ep.path}</span>
                              </button>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </aside>

          <main className="lg:col-span-9">
            {!selectedEndpoint ? (
              <div className="space-y-8">
                <Card className="border-[hsl(var(--pearsign-primary))]/20">
                  <CardHeader><CardTitle>Welcome to PearSign API</CardTitle><CardDescription>Build powerful document signing workflows</CardDescription></CardHeader>
                  <CardContent><p className="text-muted-foreground whitespace-pre-line">{spec.info.description}</p></CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" />Quick Start</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-muted/50 border">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--pearsign-primary))] to-blue-600 flex items-center justify-center mb-3"><Key className="h-5 w-5 text-white" /></div>
                        <h3 className="font-medium mb-1">1. Get API Key</h3>
                        <p className="text-sm text-muted-foreground">Create an API key in Settings</p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50 border">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3"><Send className="h-5 w-5 text-white" /></div>
                        <h3 className="font-medium mb-1">2. Make Requests</h3>
                        <p className="text-sm text-muted-foreground">Use Bearer authentication</p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50 border">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-3"><Shield className="h-5 w-5 text-white" /></div>
                        <h3 className="font-medium mb-1">3. Handle Responses</h3>
                        <p className="text-sm text-muted-foreground">Check status and rate limits</p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Example Request</h4>
                      <div className="bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                        <pre>{`curl -X GET "/api/v1/envelopes" \\
  -H "Authorization: Bearer ps_live_xxx.secret"`}</pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Authentication</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">All API requests require a valid API key.</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded">Authorization: Bearer ps_live_xxx.secret</code>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Rate Limiting</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">Rate limits are enforced per API key.</p>
                      <div className="text-xs space-y-1">
                        <div><code className="bg-muted px-1 rounded">X-RateLimit-Limit</code></div>
                        <div><code className="bg-muted px-1 rounded">X-RateLimit-Remaining</code></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <Card className="border-[hsl(var(--pearsign-primary))]/20">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <Badge className={`${methodColors[selectedEndpoint.method]} text-white px-3 py-1`}>{selectedEndpoint.method}</Badge>
                      <div>
                        <CardTitle className="font-mono text-lg">/api/v1{selectedEndpoint.path}</CardTitle>
                        <CardDescription className="mt-1">{selectedEndpoint.spec.summary}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {selectedEndpoint.spec.description && <CardContent><p className="text-sm text-muted-foreground">{selectedEndpoint.spec.description}</p></CardContent>}
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" />Try It Out</CardTitle><CardDescription>Test this endpoint with your API key</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    {selectedEndpoint.spec.parameters && selectedEndpoint.spec.parameters.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Parameters</Label>
                        <div className="grid gap-3">
                          {selectedEndpoint.spec.parameters.map((param) => (
                            <div key={param.name} className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="text-sm font-mono">{param.name}</Label>
                                <Badge variant="outline" className="text-[10px]">{param.in}</Badge>
                                {param.required && <Badge variant="destructive" className="text-[10px]">required</Badge>}
                              </div>
                              {param.schema.enum ? (
                                <Select value={tryItParams[param.name] || ""} onValueChange={(v) => setTryItParams((p) => ({ ...p, [param.name]: v }))}>
                                  <SelectTrigger><SelectValue placeholder={`Select ${param.name}`} /></SelectTrigger>
                                  <SelectContent>{param.schema.enum.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                                </Select>
                              ) : (
                                <Input value={tryItParams[param.name] || ""} onChange={(e) => setTryItParams((p) => ({ ...p, [param.name]: e.target.value }))} placeholder={param.description} className="font-mono text-sm" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedEndpoint.method !== "GET" && selectedEndpoint.spec.requestBody && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Request Body</Label>
                        <Textarea value={tryItBody} onChange={(e) => setTryItBody(e.target.value)} placeholder="Enter JSON body" className="font-mono text-sm min-h-[150px]" />
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <Button onClick={executeRequest} disabled={executing || !apiKey} className="bg-gradient-to-r from-[hsl(var(--pearsign-primary))] to-blue-600">
                        {executing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Execute
                      </Button>
                      {!apiKey && <p className="text-sm text-muted-foreground">Enter your API key to try this endpoint</p>}
                    </div>

                    {tryItResponse && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Response</Label>
                          <div className="flex items-center gap-2">
                            <Badge variant={tryItResponse.status >= 200 && tryItResponse.status < 300 ? "default" : "destructive"}>{tryItResponse.status}</Badge>
                            <span className="text-xs text-muted-foreground">{tryItResponse.time}ms</span>
                          </div>
                        </div>
                        <div className="bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-[400px] overflow-y-auto">
                          <pre>{JSON.stringify(tryItResponse.body, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Code className="h-4 w-4" />Code Examples</CardTitle></CardHeader>
                  <CardContent>
                    <Tabs defaultValue="curl">
                      <TabsList>
                        <TabsTrigger value="curl" className="gap-1"><Terminal className="h-3 w-3" />cURL</TabsTrigger>
                        <TabsTrigger value="javascript" className="gap-1"><Braces className="h-3 w-3" />JavaScript</TabsTrigger>
                        <TabsTrigger value="sdk" className="gap-1"><Zap className="h-3 w-3" />SDK</TabsTrigger>
                      </TabsList>
                      <TabsContent value="curl" className="mt-4">
                        <div className="relative">
                          <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={() => copyToClipboard(generateCurlCommand())}>
                            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <div className="bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-sm overflow-x-auto"><pre>{generateCurlCommand()}</pre></div>
                        </div>
                      </TabsContent>
                      <TabsContent value="javascript" className="mt-4">
                        <div className="bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                          <pre>{`const response = await fetch("/api/v1${selectedEndpoint.path}", {
  method: "${selectedEndpoint.method}",
  headers: {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json",
  },${selectedEndpoint.method !== "GET" ? `\n  body: JSON.stringify(${tryItBody || "{}"}),` : ""}
});
const data = await response.json();`}</pre>
                        </div>
                      </TabsContent>
                      <TabsContent value="sdk" className="mt-4">
                        <div className="bg-slate-950 text-slate-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                          <pre>{`import { PearSignClient } from '@pearsign/sdk';

const client = new PearSignClient({
  apiKey: process.env.PEARSIGN_API_KEY,
});

const result = await client.envelopes.${selectedEndpoint.spec.operationId}();`}</pre>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

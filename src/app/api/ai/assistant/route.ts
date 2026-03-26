import { NextRequest, NextResponse } from "next/server";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { sql } from "@/lib/db";
import OpenAI from "openai";

// ── AI provider helpers (same pattern as /api/ai/chat) ───────────────────────

function getPlatformOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

const AI_CONFIG_CACHE = new Map<
  string,
  {
    config: {
      provider: "openai" | "anthropic" | null;
      apiKey: string | null;
      model: string | null;
    };
    cachedAt: number;
  }
>();
const AI_CONFIG_TTL = 60_000;

async function getTenantAIConfig(tenantId: string) {
  const cached = AI_CONFIG_CACHE.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < AI_CONFIG_TTL) return cached.config;

  try {
    const configs = await sql`
      SELECT integration_type, config FROM integration_configs
      WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId})
        AND integration_type IN ('openai', 'anthropic') AND enabled = true
      ORDER BY integration_type ASC
    `;
    for (const row of configs) {
      if (row.integration_type === "openai" && row.config?.apiKey) {
        const result = { provider: "openai" as const, apiKey: row.config.apiKey, model: row.config.model || "gpt-4" };
        AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
        return result;
      }
      if (row.integration_type === "anthropic" && row.config?.apiKey) {
        const result = { provider: "anthropic" as const, apiKey: row.config.apiKey, model: row.config.model || "claude-3-sonnet-20240229" };
        AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
        return result;
      }
    }
  } catch {}

  const result = { provider: null, apiKey: null, model: null };
  AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
  return result;
}

// ── Context fetcher ───────────────────────────────────────────────────────────

async function fetchUserContext(tenantId: string, userId: string) {
  const results = await Promise.allSettled([
    // Recent envelopes / sent documents
    sql`
      SELECT d.envelope_id, d.title, d.created_at,
        COUNT(s.id) AS total,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) AS signed,
        COUNT(CASE WHEN s.status NOT IN ('completed','voided','declined') THEN 1 END) AS pending,
        json_agg(json_build_object('name', s.name, 'email', s.email, 'status', s.status)) AS signers
      FROM documents d
      LEFT JOIN signing_sessions s ON s.document_id = d.id
      WHERE d.tenant_id = ${tenantId}
        AND d.created_by = ${userId}
      GROUP BY d.envelope_id, d.title, d.created_at
      ORDER BY d.created_at DESC
      LIMIT 10
    `,
    // Contacts
    sql`
      SELECT name, email, company, last_used_at
      FROM contacts
      WHERE tenant_id = ${tenantId}
      ORDER BY last_used_at DESC NULLS LAST
      LIMIT 20
    `,
    // Fusion forms
    sql`
      SELECT name, description, status,
        (SELECT COUNT(*) FROM fusion_form_submissions ffs WHERE ffs.fusion_form_id = ff.id) AS submissions
      FROM fusion_forms ff
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT 10
    `,
    // Templates
    sql`
      SELECT name, category, created_at
      FROM templates
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT 10
    `,
  ]);

  const envelopes  = results[0].status === "fulfilled" ? results[0].value : [];
  const contacts   = results[1].status === "fulfilled" ? results[1].value : [];
  const forms      = results[2].status === "fulfilled" ? results[2].value : [];
  const templates  = results[3].status === "fulfilled" ? results[3].value : [];

  return { envelopes, contacts, forms, templates };
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx: {
  envelopes: unknown[];
  contacts: unknown[];
  forms: unknown[];
  templates: unknown[];
  userName: string;
}) {
  const envelopesSummary = ctx.envelopes.length
    ? ctx.envelopes
        .map((e: any) =>
          `- "${e.title}" | sent ${new Date(e.created_at).toLocaleDateString()} | ${e.signed}/${e.total} signed | pending: ${e.pending} | signers: ${JSON.stringify(e.signers)}`
        )
        .join("\n")
    : "No documents sent yet.";

  const contactsSummary = ctx.contacts.length
    ? ctx.contacts
        .map((c: any) => `- ${c.name} <${c.email}>${c.company ? ` (${c.company})` : ""}`)
        .join("\n")
    : "No contacts yet.";

  const formsSummary = ctx.forms.length
    ? ctx.forms
        .map((f: any) => `- "${f.name}" | status: ${f.status} | submissions: ${f.submissions}`)
        .join("\n")
    : "No FusionForms yet.";

  const templatesSummary = ctx.templates.length
    ? ctx.templates.map((t: any) => `- "${t.name}" (${t.category})`).join("\n")
    : "No templates yet.";

  return `You are the PearSign AI Assistant helping ${ctx.userName} manage their document signing workspace.

You have real-time access to the user's data, summarised below. Use this to give accurate, personalised answers.

## USER'S RECENT DOCUMENTS (up to 10)
${envelopesSummary}

## CONTACTS (up to 20)
${contactsSummary}

## FUSION FORMS (public signing links, up to 10)
${formsSummary}

## TEMPLATES (up to 10)
${templatesSummary}

---

## YOUR CAPABILITIES
You can help the user:
- **Understand their data** — who has signed, who's pending, submission stats, contact history
- **Take actions** — guide them step-by-step to send documents, create templates, set up FusionForms, or export data
- **Generate documents** — draft contracts, NDAs, agreements in plain English that they can upload and send
- **Send email reminders** — explain how to resend/remind signers through PearSign's UI
- **Manage contacts** — list, find, or suggest contacts for new sends
- **Answer questions** — explain PearSign features, signing workflows, audit trails

## RESPONSE STYLE
- Be concise and direct. Use bullet points and short paragraphs.
- When listing documents or contacts, format them cleanly.
- For action requests ("send a reminder", "create a form"), give clear step-by-step instructions in the app.
- If a user asks you to draft a document, produce a complete, professional draft they can copy.
- Never make up data not present in the context above.
- If you don't know something, say so and suggest where in the app to find it.`;
}

// ── Anthropic streaming helper ────────────────────────────────────────────────

async function streamAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  return response.body!;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const POST = withTenant(
  async (request: NextRequest, { tenantId, userId, userName }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { messages } = body as { messages: { role: string; content: string }[] };

      if (!messages?.length) {
        return NextResponse.json({ error: "messages required" }, { status: 400 });
      }

      // Fetch live user context and AI config in parallel
      const [userCtx, tenantConfig] = await Promise.all([
        fetchUserContext(tenantId ?? "", userId ?? ""),
        getTenantAIConfig(tenantId ?? "").catch(() => ({ provider: null, apiKey: null, model: null })),
      ]);

      const systemPrompt = buildSystemPrompt({ ...userCtx, userName: userName || "there" });
      const encoder = new TextEncoder();

      const typedMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // ── Anthropic (tenant key) ──
      if (tenantConfig.provider === "anthropic" && tenantConfig.apiKey) {
        try {
          const body = await streamAnthropic(
            tenantConfig.apiKey,
            tenantConfig.model || "claude-3-5-sonnet-20241022",
            systemPrompt,
            typedMessages
          );

          const readable = new ReadableStream({
            async start(controller) {
              const reader = body.getReader();
              const decoder = new TextDecoder();
              let buf = "";
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  const lines = buf.split("\n");
                  buf = lines.pop() || "";
                  for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === "content_block_delta" && data.delta?.text) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: data.delta.text })}\n\n`));
                      }
                    } catch {}
                  }
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
              } catch (e) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
                controller.close();
              }
            },
          });

          return new NextResponse(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        } catch (e) {
          console.error("[AI Assistant] Anthropic error:", e);
        }
      }

      // ── OpenAI (tenant key) ──
      if (tenantConfig.provider === "openai" && tenantConfig.apiKey) {
        try {
          const openai = new OpenAI({ apiKey: tenantConfig.apiKey });
          const stream = await openai.chat.completions.create({
            model: tenantConfig.model || "gpt-4",
            messages: [{ role: "system", content: systemPrompt }, ...typedMessages],
            stream: true,
            max_tokens: 4096,
          });

          const readable = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of stream) {
                  const text = chunk.choices[0]?.delta?.content || "";
                  if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
              } catch (e) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
                controller.close();
              }
            },
          });

          return new NextResponse(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        } catch (e) {
          console.error("[AI Assistant] OpenAI tenant error:", e);
        }
      }

      // ── Platform OpenAI fallback ──
      const platformAI = getPlatformOpenAI();
      if (!platformAI) {
        return NextResponse.json(
          {
            error: "no_ai_provider",
            message: "No AI provider configured. Add an OpenAI or Anthropic API key in Settings → Integrations.",
          },
          { status: 503 }
        );
      }

      const stream = await platformAI.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "system", content: systemPrompt }, ...typedMessages],
        stream: true,
        max_completion_tokens: 4096,
      });

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content || "";
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            controller.close();
          } catch (e) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    } catch (error) {
      console.error("[AI Assistant] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Assistant failed" },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ["canSendDocuments"] }
);

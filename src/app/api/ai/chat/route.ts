import { NextRequest, NextResponse } from "next/server";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { sql } from "@/lib/db";
import OpenAI from "openai";

function getPlatformOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

const AI_CONFIG_CACHE = new Map<string, { config: { provider: 'openai' | 'anthropic' | null; apiKey: string | null; model: string | null }; cachedAt: number }>();
const AI_CONFIG_TTL = 60_000;

async function getTenantAIConfig(tenantId: string) {
  const cached = AI_CONFIG_CACHE.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < AI_CONFIG_TTL) {
    return cached.config;
  }
  try {
    const configs = await sql`
      SELECT integration_type, config FROM integration_configs
      WHERE (org_id = ${tenantId} OR tenant_id = ${tenantId})
        AND integration_type IN ('openai', 'anthropic') AND enabled = true
      ORDER BY integration_type ASC
    `;
    for (const row of configs) {
      if (row.integration_type === 'openai' && row.config?.apiKey) {
        const result = { provider: 'openai' as const, apiKey: row.config.apiKey, model: row.config.model || 'gpt-4' };
        AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
        return result;
      }
      if (row.integration_type === 'anthropic' && row.config?.apiKey) {
        const result = { provider: 'anthropic' as const, apiKey: row.config.apiKey, model: row.config.model || 'claude-3-sonnet-20240229' };
        AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
        return result;
      }
    }
    const result = { provider: null, apiKey: null, model: null };
    AI_CONFIG_CACHE.set(tenantId, { config: result, cachedAt: Date.now() });
    return result;
  } catch {
    return { provider: null, apiKey: null, model: null };
  }
}

const SYSTEM_PROMPT = `You are PearSign's AI Document Assistant — a professional legal document drafting expert. You help users create, modify, and refine legal documents through natural conversation.

Your capabilities:
- Draft complete legal documents (NDAs, contracts, agreements, policies, etc.)
- Modify existing documents based on user instructions
- Explain legal terms and clauses in plain language
- Suggest improvements to make documents more comprehensive

MANDATORY DOCUMENT FORMATTING — follow exactly for every document you generate:

1. TITLE: Use "# " prefix, ALL CAPS (e.g., # NON-DISCLOSURE AGREEMENT)
2. ARTICLE HEADINGS: Use "## " prefix, ALL CAPS with article number (e.g., ## ARTICLE 1. DEFINITIONS)
3. SUBSECTION HEADINGS: Use "### " prefix (e.g., ### 1.1 Scope of Services)
4. BODY TEXT: Write in full, well-formed paragraphs using standard legal language. No fancy Unicode characters.
5. LISTS: Use "- " for bullet points. Use "1. " "2. " for numbered items.
6. DIVIDERS: Use "---" (three hyphens, ASCII only) between major parts.
7. NO bare ALL-CAPS lines without a # prefix — every heading must use # / ## / ###.
8. SIGNATURE BLOCK: End every document with "## SIGNATURES" — do not include any drawn lines, just the heading.

Writing style:
- Use formal, precise legal language with numbered articles and sections
- Include recitals ("WHEREAS" clauses) where appropriate
- Define key terms in a Definitions section
- Each article should be clearly numbered and titled

General guidelines:
1. When asked to create a document, gather necessary information conversationally then generate the full document.
2. Be helpful, clear, and professional.
3. When modifying a document, return the COMPLETE updated document, not just the changes.
4. If the user's request is ambiguous, ask clarifying questions.

You are NOT a lawyer. Documents should be reviewed by qualified legal counsel before execution.`;

function buildChatMessages(messages: { role: string; content: string }[], currentDocument?: string, documentType?: string) {
  const systemMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (currentDocument) {
    systemMessages.push({
      role: "system",
      content: `The user is currently working on the following document (type: ${documentType || "unknown"}):\n\n---\n${currentDocument}\n---\n\nWhen the user asks for modifications, return the COMPLETE updated document wrapped in <document> tags so it can be extracted. For example:\n<document>\n...full document content...\n</document>\n\nIf the user is just chatting or asking questions (not requesting document changes), respond normally without the document tags.`,
    });
  }

  return [
    ...systemMessages,
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}

async function streamAnthropicChat(apiKey: string, model: string, messages: { role: string; content: string }[], currentDocument?: string, documentType?: string) {
  const systemContent = SYSTEM_PROMPT + (currentDocument
    ? `\n\nThe user is currently working on the following document (type: ${documentType || "unknown"}):\n\n---\n${currentDocument}\n---\n\nWhen the user asks for modifications, return the COMPLETE updated document wrapped in <document> tags.`
    : '');

  const anthropicMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemContent,
      messages: anthropicMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  return response.body;
}

export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body = await request.json();
      const { messages, currentDocument, documentType } = body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: "Messages are required" }, { status: 400 });
      }

      const tenantConfig = await getTenantAIConfig(tenantId ?? '').catch(() => ({ provider: null, apiKey: null, model: null }));
      const hasReplitAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
      const encoder = new TextEncoder();

      if (tenantConfig.provider === 'anthropic' && tenantConfig.apiKey) {
        try {
          const anthropicBody = await streamAnthropicChat(tenantConfig.apiKey, tenantConfig.model || 'claude-3-sonnet-20240229', messages, currentDocument, documentType);
          if (!anthropicBody) throw new Error("No response body");

          const readable = new ReadableStream({
            async start(controller) {
              const reader = anthropicBody.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';
                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content_block_delta' && data.delta?.text) {
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: data.delta.text })}\n\n`));
                        }
                      } catch {}
                    }
                  }
                }
                if (buffer.trim().startsWith('data: ')) {
                  try {
                    const data = JSON.parse(buffer.trim().slice(6));
                    if (data.type === 'content_block_delta' && data.delta?.text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: data.delta.text })}\n\n`));
                    }
                  } catch {}
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
              } catch (error) {
                console.error("[AI Chat] Anthropic stream error:", error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
                controller.close();
              }
            },
          });

          return new NextResponse(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        } catch (error) {
          console.error("[AI Chat] Anthropic error, trying fallback:", error);
        }
      }

      if (tenantConfig.provider === 'openai' && tenantConfig.apiKey) {
        try {
          const tenantOpenAI = new OpenAI({ apiKey: tenantConfig.apiKey });
          const chatMessages = buildChatMessages(messages, currentDocument, documentType);
          const stream = await tenantOpenAI.chat.completions.create({
            model: tenantConfig.model || 'gpt-4',
            messages: chatMessages,
            stream: true,
            max_tokens: 8192,
          });

          const readable = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of stream) {
                  const content = chunk.choices[0]?.delta?.content || "";
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                controller.close();
              } catch (error) {
                console.error("[AI Chat] OpenAI tenant stream error:", error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
                controller.close();
              }
            },
          });

          return new NextResponse(readable, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
          });
        } catch (error) {
          console.error("[AI Chat] Tenant OpenAI error, trying fallback:", error);
        }
      }

      const replitAI = getPlatformOpenAI();
      if (!replitAI) {
        return NextResponse.json(
          {
            error: "no_ai_provider",
            message: "No AI provider is configured. Add an OpenAI or Anthropic API key in Settings → Integrations to enable AI features.",
          },
          { status: 503 }
        );
      }

      const chatMessages = buildChatMessages(messages, currentDocument, documentType);
      const stream = await replitAI.chat.completions.create({
        model: "gpt-4.1",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 8192,
      });

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            controller.close();
          } catch (error) {
            console.error("[AI Chat] Stream error:", error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    } catch (error) {
      console.error("[AI Chat] Error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Chat failed" },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ["canSendDocuments"] }
);

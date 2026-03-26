import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import OpenAI from "openai";

function getReplitOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

interface GenerateRequest {
  documentType: string;
  documentName: string;
  answers: Record<string, string>;
}

const AI_CONFIG_CACHE = new Map<string, { config: { provider: 'openai' | 'anthropic' | null; apiKey: string | null; model: string | null }; cachedAt: number }>();
const AI_CONFIG_TTL = 60_000;

async function getTenantAIConfig(tenantId: string): Promise<{
  provider: 'openai' | 'anthropic' | null;
  apiKey: string | null;
  model: string | null;
}> {
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

export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body: GenerateRequest = await request.json();
      const { documentType, documentName, answers } = body;

      if (!documentType || !documentName || !answers) {
        return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
      }

      const answersText = Object.entries(answers)
        .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
        .join('\n\n');

      const prompt = `Generate a professional, comprehensive ${documentName} based on the following information.

Document Type: ${documentType}
Document Name: ${documentName}

User Provided Information:
${answersText}

Requirements:
1. Create a complete, legally-sound document with all standard clauses for this document type
2. Use formal legal language, numbered articles, and defined terms throughout
3. Include WHEREAS recitals where appropriate
4. Define all key terms in a Definitions article
5. End with ## SIGNATURES (do not include any drawn lines — the system adds signature fields automatically)

MANDATORY FORMATTING — follow exactly:
- Document title:        # TITLE IN ALL CAPS  (e.g., # NON-DISCLOSURE AGREEMENT)
- Article headings:      ## ARTICLE 1. NAME IN ALL CAPS  (e.g., ## ARTICLE 1. DEFINITIONS)
- Subsection headings:   ### 1.1 Subsection Name  (e.g., ### 1.1 Scope of Services)
- Bullets:               "- " prefix
- Numbered items:        "1. " "2. " prefix
- Section divider:       "---" (three plain hyphens — NO Unicode characters whatsoever)
- NO bare ALL-CAPS lines without a # prefix — every heading must use # / ## / ###
- Comprehensive length: 2000+ words for complex documents

Generate the complete document now. Output only the document text, no commentary:`;

      const tenantConfig = await getTenantAIConfig(tenantId);
      const hasReplitAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);

      if (tenantConfig.provider === 'anthropic' && tenantConfig.apiKey) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': tenantConfig.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: tenantConfig.model || 'claude-3-sonnet-20240229',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({
            success: true, provider: 'anthropic', model: tenantConfig.model,
            content: data.content[0]?.text || '',
          });
        }
      }

      if (tenantConfig.provider === 'openai' && tenantConfig.apiKey) {
        const tenantOpenAI = new OpenAI({ apiKey: tenantConfig.apiKey });
        const completion = await tenantOpenAI.chat.completions.create({
          model: tenantConfig.model || 'gpt-4',
          messages: [
            { role: 'system', content: 'You are an expert legal document drafting assistant. Generate comprehensive, professionally formatted legal documents.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
        });
        return NextResponse.json({
          success: true, provider: 'openai', model: tenantConfig.model,
          content: completion.choices[0]?.message?.content || '',
        });
      }

      const replitAI = getReplitOpenAI();
      if (!replitAI) {
        return NextResponse.json({ success: false, error: 'No AI provider configured. Please configure an AI integration in Settings.' }, { status: 400 });
      }

      const completion = await replitAI.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: 'system', content: 'You are an expert legal document drafting assistant. Generate comprehensive, professionally formatted legal documents.' },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 8192,
      });

      return NextResponse.json({
        success: true,
        provider: 'openai',
        model: 'gpt-4.1',
        content: completion.choices[0]?.message?.content || '',
        configured: true,
      });
    } catch (error) {
      console.error('[AI Generate] Error:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate document' },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ['canSendDocuments'] }
);

export const GET = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const hasReplitAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
      const tenantConfig = await getTenantAIConfig(tenantId);

      return NextResponse.json({
        success: true,
        configured: hasReplitAI || !!tenantConfig.provider,
        provider: tenantConfig.provider || (hasReplitAI ? 'openai' : null),
        model: tenantConfig.model || (hasReplitAI ? 'gpt-4.1' : null),
      });
    } catch (error) {
      console.error('[AI Generate] Error checking config:', error);
      return NextResponse.json({ success: false, error: 'Failed to check AI configuration' }, { status: 500 });
    }
  }
);

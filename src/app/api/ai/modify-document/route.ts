import { NextRequest, NextResponse } from "next/server";
import { withTenant, TenantApiContext } from "@/lib/tenant-middleware";
import { sql } from "@/lib/db";
import OpenAI from "openai";

const platformOpenAI = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

interface ModifyRequest {
  currentDocument: string;
  userRequest: string;
  documentType: string;
  documentName: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberToWords(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  return num <= 12 ? ones[num] : num.toString();
}

function applyRuleBasedModification(
  document: string,
  request: string
): { modified: string; description: string } {
  const requestLower = request.toLowerCase();
  let modified = document;

  const changePattern = /(?:change|replace|update)\s+["']?(\w+)["']?\s+(?:to|with)\s+["']?(\w+)["']?/i;
  const changeMatch = request.match(changePattern);
  if (changeMatch) {
    const oldWord = changeMatch[1];
    const newWord = changeMatch[2];
    const regex = new RegExp('\\b' + escapeRegex(oldWord) + '\\b', 'gi');
    const count = (modified.match(regex) || []).length;
    if (count > 0) {
      modified = modified.replace(regex, newWord);
      return { modified, description: `Changed "${oldWord}" to "${newWord}" (${count} occurrence${count > 1 ? 's' : ''})` };
    }
  }

  const durationMatch = requestLower.match(/(?:change|update|set)\s+(?:the\s+)?(?:duration|term|period)\s+(?:to\s+)?(\d+)\s*(year|month|week|day)s?/i);
  if (durationMatch) {
    const amount = durationMatch[1];
    const unit = durationMatch[2];
    const durationText = `${amount} (${numberToWords(parseInt(amount))}) ${unit}${parseInt(amount) > 1 ? 's' : ''}`;
    modified = modified.replace(/(?:for\s+)?(?:a\s+)?(?:period\s+of\s+)?(?:\d+\s*\([^)]+\)\s*)?(?:years?|months?|weeks?|days?)/gi, durationText);
    return { modified, description: `Changed duration to ${durationText}` };
  }

  return { modified: document, description: 'No matching modification found.' };
}

const MODIFY_SYSTEM_PROMPT = 'You are a legal document editing assistant. Modify the document according to the user\'s request while maintaining professional formatting. Return the COMPLETE modified document.';

export const POST = withTenant(
  async (request: NextRequest, { tenantId }: TenantApiContext) => {
    try {
      const body: ModifyRequest = await request.json();
      const { currentDocument, userRequest, documentType, documentName } = body;

      if (!currentDocument || !userRequest) {
        return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
      }

      const userPrompt = `Document:\n${currentDocument}\n\nRequest: "${userRequest}"\n\nReturn the complete updated document:`;
      const tenantConfig = await getTenantAIConfig(tenantId);
      const hasReplitAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);

      if (tenantConfig.provider === 'anthropic' && tenantConfig.apiKey) {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': tenantConfig.apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: tenantConfig.model || 'claude-3-sonnet-20240229',
              max_tokens: 8192,
              system: MODIFY_SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            return NextResponse.json({
              success: true,
              document: data.content[0]?.text || currentDocument,
              description: 'Document modified using AI',
              usedAI: true,
              provider: 'anthropic',
            });
          }
          console.error('[AI Modify] Anthropic error:', response.status);
        } catch (error) {
          console.error('[AI Modify] Anthropic error:', error);
        }
      }

      if (tenantConfig.provider === 'openai' && tenantConfig.apiKey) {
        try {
          const tenantOpenAI = new OpenAI({ apiKey: tenantConfig.apiKey });
          const completion = await tenantOpenAI.chat.completions.create({
            model: tenantConfig.model || 'gpt-4',
            messages: [
              { role: 'system', content: MODIFY_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 8192,
          });
          return NextResponse.json({
            success: true,
            document: completion.choices[0]?.message?.content || currentDocument,
            description: 'Document modified using AI',
            usedAI: true,
            provider: 'openai',
          });
        } catch (error) {
          console.error('[AI Modify] Tenant OpenAI error:', error);
        }
      }

      if (hasReplitAI) {
        try {
          const completion = await platformOpenAI.chat.completions.create({
            model: "gpt-4.1",
            messages: [
              { role: 'system', content: MODIFY_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            max_completion_tokens: 8192,
          });

          return NextResponse.json({
            success: true,
            document: completion.choices[0]?.message?.content || currentDocument,
            description: `Document modified using AI`,
            usedAI: true,
            provider: 'openai',
          });
        } catch (aiError) {
          console.error('[AI Modify] Platform AI error, falling back to rules:', aiError);
          const result = applyRuleBasedModification(currentDocument, userRequest);
          return NextResponse.json({
            success: true,
            document: result.modified,
            description: result.description,
            usedAI: false,
            provider: null,
          });
        }
      }

      const result = applyRuleBasedModification(currentDocument, userRequest);
      return NextResponse.json({
        success: true,
        document: result.modified,
        description: result.description,
        usedAI: false,
        provider: null,
      });
    } catch (error) {
      console.error('[AI Modify] Error:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to modify document' },
        { status: 500 }
      );
    }
  },
  { requiredPermissions: ['canSendDocuments'] }
);

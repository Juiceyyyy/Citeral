import "server-only";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { env } from "@/lib/env";

const GLM_FAST_MODEL = "@cf/zai-org/glm-4.7-flash";

function workersAiFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (env.CLOUDFLARE_AI_MODEL === GLM_FAST_MODEL && typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.model === GLM_FAST_MODEL) {
        // Cloudflare exposes these controls for reasoning-capable Workers AI models.
        // Disabling GLM's hidden thinking removes a large pre-answer delay while
        // preserving normal instruction following and tool calling.
        body.reasoning_effort = null;
        body.chat_template_kwargs = {
          ...(typeof body.chat_template_kwargs === "object" && body.chat_template_kwargs !== null
            ? body.chat_template_kwargs as Record<string, unknown>
            : {}),
          enable_thinking: false,
        };
        return fetch(input, { ...init, body: JSON.stringify(body) });
      }
    } catch {
      // If a future SDK sends a non-JSON body, pass it through unchanged.
    }
  }
  return fetch(input, init);
}

const workersAi = env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
  ? createOpenAI({
      apiKey: env.CLOUDFLARE_API_TOKEN,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      name: "cloudflare-workers-ai",
      fetch: workersAiFetch,
    })
  : null;

function hasGatewayAuth() {
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
}

export function languageModel() {
  // Workers AI text models such as GLM use the OpenAI-compatible Chat Completions
  // endpoint. The callable createOpenAI provider defaults to the Responses API in
  // current AI SDK releases, which Workers AI only supports for GPT-OSS models.
  if (workersAi) return workersAi.chat(env.CLOUDFLARE_AI_MODEL);

  if (!env.ALLOW_BILLABLE_AI) {
    throw new Error(
      "Free-tier AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. Paid AI fallbacks are disabled by default.",
    );
  }

  if (hasGatewayAuth()) {
    if (!env.AI_MODEL) throw new Error("Set AI_MODEL when using Vercel AI Gateway.");
    return env.AI_MODEL;
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("Configure Cloudflare Workers AI, or explicitly enable and configure a paid AI provider.");
  }
  if (!env.OPENAI_MODEL) throw new Error("Set OPENAI_MODEL when using OPENAI_API_KEY directly.");
  return openai(env.OPENAI_MODEL);
}

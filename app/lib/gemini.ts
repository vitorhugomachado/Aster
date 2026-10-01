interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export class GeminiServiceError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
  }
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

interface GenerateOptions {
  messages: GeminiMessage[];
  systemInstruction: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseJsonSchema?: Record<string, unknown>;
}

function configuredKey() {
  return process.env.GEMINI_API_KEY?.trim() ?? '';
}

export function isGeminiConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim() || configuredKey());
}

async function generateWithGroq(options: GenerateOptions) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}` },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: options.systemInstruction },
          ...options.messages.map((message) => ({ role: message.role === 'model' ? 'assistant' : 'user', content: message.text })),
        ],
        temperature: options.temperature ?? 0.2,
        max_completion_tokens: options.maxOutputTokens ?? 1_600,
        ...(options.responseJsonSchema ? { response_format: { type: 'json_schema', json_schema: {
          name: 'address_review', strict: true,
          schema: { ...options.responseJsonSchema, additionalProperties: false },
        } } } : {}),
      }),
    });
    if (!response.ok) {
      const message = response.status === 429 ? 'Limite de uso da Groq atingido. Aguarde e tente novamente.'
        : [401, 403].includes(response.status) ? 'Groq recusou o acesso. Confira a chave e as permissões.'
          : 'A Groq não conseguiu processar a solicitação. Tente novamente.';
      throw new GeminiServiceError(message, response.status === 429 ? 429 : 503);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new GeminiServiceError('A Groq não retornou uma resposta.', 502);
    return text;
  } catch (error) {
    if (error instanceof GeminiServiceError) throw error;
    throw new GeminiServiceError('Falha temporária ao consultar a Groq.', 502);
  }
}

export async function generateWithGemini({
  messages,
  systemInstruction,
  maxOutputTokens = 1_600,
  temperature = 0.2,
  responseJsonSchema,
}: GenerateOptions) {
  if (process.env.GROQ_API_KEY?.trim()) {
    return generateWithGroq({ messages, systemInstruction, maxOutputTokens, temperature, responseJsonSchema });
  }
  const apiKey = configuredKey();
  if (!apiKey) {
    throw new GeminiServiceError('O assistente Gemini ainda não foi configurado no servidor.', 503);
  }

  const preferredModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const models = Array.from(new Set([preferredModel, 'gemini-3.5-flash', 'gemini-3.6-flash']));
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: messages.map((message) => ({
      role: message.role,
      parts: [{ text: message.text }],
    })),
    generationConfig: {
      temperature,
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: 'low' },
      ...(responseJsonSchema ? {
        responseMimeType: 'application/json',
        responseSchema: responseJsonSchema,
      } : {}),
    },
  });

  for (let index = 0; index < models.length; index += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[index])}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body,
          signal: controller.signal,
        },
      );

      const data = await response.json().catch(() => ({})) as GeminiResponse;
      if (!response.ok) {
        const upstreamMessage = data.error?.message || 'O Gemini não conseguiu processar a solicitação.';
        const hasFallback = index < models.length - 1;
        if (hasFallback && [404, 503].includes(response.status)) continue;
        const status = response.status === 429 ? 429
          : [401, 403, 503].includes(response.status) ? 503 : 502;
        throw new GeminiServiceError(upstreamMessage, status);
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) {
        const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason;
        throw new GeminiServiceError(reason
          ? `O Gemini não retornou uma resposta (${reason}).`
          : 'O Gemini não retornou uma resposta.', 502);
      }
      return text;
    } catch (error) {
      if (error instanceof GeminiServiceError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GeminiServiceError('O Gemini demorou demais para responder. Tente novamente.', 504);
      }
      throw new GeminiServiceError('Falha temporária ao consultar o Gemini.', 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new GeminiServiceError('O Gemini está temporariamente indisponível.', 503);
}

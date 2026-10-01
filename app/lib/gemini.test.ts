import { afterEach, expect, it, vi } from 'vitest';
import { generateWithGemini } from './gemini';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('uses Groq with structured JSON and translates assistant history', async () => {
  vi.stubEnv('GROQ_API_KEY', 'test-key');
  const mock = vi.fn(async (_url: unknown, _options: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: '{"changed":false}' } }] })));
  vi.stubGlobal('fetch', mock);
  const text = await generateWithGemini({ messages: [{ role: 'model', text: 'history' }], systemInstruction: 'review', responseJsonSchema: { type: 'object', required: ['changed'], properties: { changed: { type: 'boolean' } } } });
  expect(text).toBe('{"changed":false}');
  expect(mock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(String(mock.mock.calls[0][1].body));
  expect(body.messages[1].role).toBe('assistant');
  expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
});
it('reports Groq quota without fallback or leaking upstream details', async () => {
  vi.stubEnv('GROQ_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_API_KEY', 'unused');
  const mock = vi.fn(async () => new Response('secret upstream details', { status: 429 }));
  vi.stubGlobal('fetch', mock);
  await expect(generateWithGemini({ messages: [], systemInstruction: 'review' })).rejects.toMatchObject({ status: 429 });
  expect(mock).toHaveBeenCalledTimes(1);
});

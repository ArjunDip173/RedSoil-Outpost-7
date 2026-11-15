// LUNA's AI server (server/index.mjs, a Cloudflare Worker), with Gemini replaced by a fake.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JavaScript module without type declarations
import worker from '../server/index.mjs';

type Handler = { fetch(req: Request, env: Record<string, string>): Promise<Response> };
const server = worker as Handler;

let ipCounter = 0;
function ask(env: Record<string, string>, body: unknown = { model: 'luna', messages: [{ role: 'user', content: 'Why is Mars red?' }] }, ip = `10.0.0.${++ipCounter}`) {
  return server.fetch(
    new Request('https://luna-ai.example.workers.dev/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const geminiOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });
const geminiErr = (status: number, code: string, message = '') => new Response(JSON.stringify({ error: { code: status, status: code, message } }), { status });

afterEach(() => vi.unstubAllGlobals());

describe('LUNA AI server', () => {
  it('answers the game’s health and model checks, with CORS for file:// and GitHub Pages', async () => {
    const env = { GEMINI_API_KEY: 'k' };
    const models = await server.fetch(new Request('https://x/models'), env);
    expect(models.status).toBe(200);
    expect(models.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await models.json()).data[0].id).toBe('luna');
    const pre = await server.fetch(new Request('https://x/chat/completions', { method: 'OPTIONS' }), env);
    expect(pre.status).toBe(204);
    expect((await (await server.fetch(new Request('https://x/health'), env)).json()).key).toBe(true);
  });

  it('forwards a question to Gemini with the key in a header and the guard rules first', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => geminiOk('Mars is red because of rusty dust!'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await ask({ GEMINI_API_KEY: 'secret-key', MODELS: 'm-a' });
    expect(res.status).toBe(200);
    expect((await res.json()).choices[0].message.content).toBe('Mars is red because of rusty dust!');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m-a:generateContent');
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const sent = JSON.parse(String(init.body));
    expect(sent.systemInstruction.parts[0].text).toMatch(/^You are LUNA/);
    expect(sent.contents).toEqual([{ role: 'user', parts: [{ text: 'Why is Mars red?' }] }]);
  });

  it('moves on to the next model when one is used up or retired', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('/b-1:') ? geminiErr(429, 'RESOURCE_EXHAUSTED') : url.includes('/b-2:') ? geminiErr(404, 'NOT_FOUND') : geminiOk('Hi from b-3')));
    vi.stubGlobal('fetch', fetchMock);
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'b-1, b-2, b-3' });
    expect((await res.json()).choices[0].message.content).toBe('Hi from b-3');
    // the used-up and retired models are skipped next time
    await ask({ GEMINI_API_KEY: 'k', MODELS: 'b-1, b-2, b-3' });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/b-1:'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/b-2:'))).toHaveLength(1);
  });

  it('asks again without the thinking setting for models that reject it', async () => {
    const bodies: { generationConfig: { thinkingConfig?: unknown } }[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      return b.generationConfig.thinkingConfig ? geminiErr(400, 'INVALID_ARGUMENT', 'Thinking level is not supported for this model.') : geminiOk('ok');
    });
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'c-old' });
    expect((await res.json()).choices[0].message.content).toBe('ok');
    expect(bodies.map((b) => !!b.generationConfig.thinkingConfig)).toEqual([true, false]);
  });

  it('says the free Gemini limit is used up when every model is out', async () => {
    vi.stubGlobal('fetch', async () => geminiErr(429, 'RESOURCE_EXHAUSTED'));
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'd-1,d-2' });
    expect(res.status).toBe(429);
    expect((await res.text()).toLowerCase()).toMatch(/gemini.*quota/);
  });

  it('reports a bad key so the game can say so', async () => {
    vi.stubGlobal('fetch', async () => geminiErr(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key. [API_KEY_INVALID]'));
    const res = await ask({ GEMINI_API_KEY: 'bad', MODELS: 'e-1' });
    expect(res.status).toBe(502);
    expect((await res.text()).toLowerCase()).toContain('api key not valid');
  });

  it('gives a kind redirect when Gemini blocks an answer', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }));
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'f-1' });
    expect((await res.json()).choices[0].message.content).toMatch(/space/i);
  });

  it('rejects bad requests and limits each player per minute', async () => {
    vi.stubGlobal('fetch', async () => geminiOk('ok'));
    const env = { GEMINI_API_KEY: 'k', MODELS: 'g-1' };
    expect((await ask(env, { messages: [] })).status).toBe(400);
    expect((await ask(env, { messages: [{ role: 'tool', content: 'x' }] })).status).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) statuses.push((await ask(env, undefined, '192.168.1.1')).status);
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses[12]).toBe(429);
  });

  it('explains what to do when the key is missing', async () => {
    const res = await ask({});
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('deploy.sh');
  });
});

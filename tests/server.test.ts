// LUNA's AI server (server/index.mjs, a Cloudflare Worker), with Gemini replaced by a fake.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JavaScript module without type declarations
import worker from '../server/index.mjs';

type Handler = { fetch(req: Request, env: Record<string, string>): Promise<Response> };
const server = worker as Handler;

let ipCounter = 0;
function ask(
  env: Record<string, string>,
  body: unknown = { model: 'luna', messages: [{ role: 'user', content: 'Why is Mars red?' }] },
  ip = `10.0.0.${++ipCounter}`,
) {
  return server.fetch(
    new Request('https://luna-ai.example.workers.dev/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), {
    status: 200,
  });
const geminiErr = (status: number, code: string, message = '') =>
  new Response(JSON.stringify({ error: { code: status, status: code, message } }), { status });

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
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/b-1:')
        ? geminiErr(429, 'RESOURCE_EXHAUSTED')
        : url.includes('/b-2:')
          ? geminiErr(404, 'NOT_FOUND')
          : geminiOk('Hi from b-3'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'b-1, b-2, b-3' });
    expect((await res.json()).choices[0].message.content).toBe('Hi from b-3');
    // the used-up and retired models are skipped next time
    await ask({ GEMINI_API_KEY: 'k', MODELS: 'b-1, b-2, b-3' });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/b-1:'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/b-2:'))).toHaveLength(1);
  });

  it('steps the thinking setting down for models that reject it', async () => {
    const levels: (string | undefined)[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const level = JSON.parse(String(init.body)).generationConfig.thinkingConfig?.thinkingLevel;
      levels.push(level);
      return level
        ? geminiErr(
            400,
            'INVALID_ARGUMENT',
            `Thinking level ${String(level).toUpperCase()} is not supported for this model.`,
          )
        : geminiOk('ok');
    });
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'c-old' });
    expect((await res.json()).choices[0].message.content).toBe('ok');
    expect(levels).toEqual(['minimal', 'low', undefined]);
    // remembered: the next question goes straight to the setting that works
    await ask({ GEMINI_API_KEY: 'k', MODELS: 'c-old' });
    expect(levels).toEqual(['minimal', 'low', undefined, undefined]);
  });

  it('asks the next model too when one is slow, and answers with whichever is first', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      url.includes('/h-slow:')
        ? new Promise<Response>((r) => setTimeout(() => r(geminiOk('slow answer')), 3000))
        : Promise.resolve(geminiOk('fast answer')),
    );
    const t0 = Date.now();
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'h-slow,h-fast', HEDGE_MS: '50' });
    expect((await res.json()).choices[0].message.content).toBe('fast answer');
    expect(res.headers.get('X-Luna-Model')).toBe('h-fast');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('shares a used-up daily limit with every copy of the server', async () => {
    const store = new Map<string, string>();
    const STATE = {
      get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
      put: async (k: string, v: string) => void store.set(k, v),
    };
    const perDay = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
              },
              { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '11063s' },
            ],
          },
        }),
        { status: 429 },
      );
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return url.includes('/k-1:') ? perDay() : geminiOk('from k-2');
    });
    const env = { GEMINI_API_KEY: 'k', MODELS: 'k-1,k-2', STATE } as unknown as Record<string, string>;
    expect((await (await ask(env)).json()).choices[0].message.content).toBe('from k-2');
    const saved = JSON.parse(store.get('resting')!);
    expect(saved['k-1'] - Date.now()).toBeGreaterThan(11000 * 1000);
    // a brand-new copy of the server (empty memory) skips k-1 straight away
    vi.resetModules();
    const fresh = (await import('../server/index.mjs')).default as Handler;
    calls.length = 0;
    const res = await fresh.fetch(
      new Request('https://x/chat/completions', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '10.9.9.9' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
      env,
    );
    expect((await res.json()).choices[0].message.content).toBe('from k-2');
    expect(calls.some((u) => u.includes('/k-1:'))).toBe(false);
  });

  it('says the free Gemini limit is used up when every model is out', async () => {
    vi.stubGlobal('fetch', async () => geminiErr(429, 'RESOURCE_EXHAUSTED'));
    const res = await ask({ GEMINI_API_KEY: 'k', MODELS: 'd-1,d-2' });
    expect(res.status).toBe(429);
    expect((await res.text()).toLowerCase()).toMatch(/gemini.*quota/);
  });

  it('reports a bad key so the game can say so', async () => {
    vi.stubGlobal('fetch', async () =>
      geminiErr(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key. [API_KEY_INVALID]'),
    );
    const res = await ask({ GEMINI_API_KEY: 'bad', MODELS: 'e-1' });
    expect(res.status).toBe(502);
    expect((await res.text()).toLowerCase()).toContain('api key not valid');
  });

  it('gives a kind redirect when Gemini blocks an answer', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
    );
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

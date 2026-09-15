import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChatUrl, modelsUrl, modelsCandidates, matchProvider, sanitizeFields,
  parseChatContent, buildChatPayload, extractCards, listModels, testConnection,
  recognizePhotoMulti, PROMPT, MULTI_PROMPT, type HttpAdapter,
} from '../src/services/llm.js';

const stubHttp = (post?: (url: string) => { status: number; bodyText: string },
  get?: (url: string) => { status: number; bodyText: string }): HttpAdapter => ({
  postJson: async (url) => (post ? post(url) : { status: 200, bodyText: '{}' }),
  get: async (url) => (get ? get(url) : { status: 404, bodyText: 'no' }),
});

describe('llm url 规则与桌面版一致', () => {
  it('normalizeChatUrl', () => {
    assert.equal(normalizeChatUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
    assert.equal(normalizeChatUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/chat/completions');
    assert.equal(normalizeChatUrl('https://x/v1/chat/completions'), 'https://x/v1/chat/completions');
    assert.equal(normalizeChatUrl('https://tokenkey.megmeet.com/v1/chat/completions'),
      'https://tokenkey.megmeet.com/v1/chat/completions');
  });
  it('modelsCandidates 互为兜底', () => {
    assert.deepEqual(modelsCandidates('https://a/v1/chat/completions'),
      ['https://a/v1/models', 'https://a/models']);
    assert.deepEqual(modelsUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/models');
  });
  it('matchProvider', () => {
    assert.equal(matchProvider('https://api.deepseek.com/chat/completions'), 'deepseek');
    assert.equal(matchProvider('https://tokenkey.megmeet.com/v1/chat/completions'), 'megmeet');
    assert.equal(matchProvider('https://other.example/v9/chat/completions'), 'custom');
  });
  it('提示词与桌面版逐字一致', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../carddeck/llm.py', import.meta.url), 'utf-8');
    for (const line of PROMPT.split('\n').slice(0, 3)) assert.ok(src.includes(line), line.slice(0, 12));
    for (const line of MULTI_PROMPT.split('\n').slice(0, 2)) assert.ok(src.includes(line), line.slice(0, 12));
  });
});

describe('llm 解析与调用', () => {
  it('去围栏 + 取大括号', () => {
    assert.deepEqual(parseChatContent('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseChatContent('note {"cards":[]} tail'), { cards: [] });
  });
  it('sanitizeFields 缺省与类型纠正', () => {
    const f = sanitizeFields({ name: null, tags_printed: '机器人', tags_inferred: 7, extra: 1 });
    assert.equal(f.name, '');
    assert.deepEqual(f.tags_printed, ['机器人']);
    assert.deepEqual(f.tags_inferred, []);
    assert.ok(!('extra' in f));
  });
  it('recognizePhotoMulti 取 cards 上限 10', async () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({ name: `N${i}` }));
    const http = stubHttp(() => ({ status: 200, bodyText: JSON.stringify({ cards }) }));
    const got = await recognizePhotoMulti(http, 'data:image/jpeg;base64,x',
      { api_url: 'https://api.deepseek.com', api_key: 'k', model: 'm' });
    assert.equal(got.length, 10);
    assert.equal(got[0].name, 'N0');
  });
  it('未配 Key 返回空（整图）', async () => {
    const got = await recognizePhotoMulti(stubHttp(), 'x', { api_url: '', api_key: '', model: '' });
    assert.deepEqual(got, []);
  });
  it('HTTP 失败带状态与 401 提示', async () => {
    const http = stubHttp(() => ({ status: 401, bodyText: '{"error":"bad"}' }));
    await assert.rejects(
      recognizePhotoMulti(http, 'x', { api_url: 'https://a/b', api_key: 'k', model: 'm' }),
      /HTTP 401.*Key 未通过/);
  });
  it('listModels 逐个候选尝试', async () => {
    const seen: string[] = [];
    const http = stubHttp(undefined, (url) => {
      seen.push(url);
      return url.endsWith('/models') && !url.includes('/v1/')
        ? { status: 200, bodyText: JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, {}] }) }
        : { status: 404, bodyText: 'x' };
    });
    const r = await listModels(http, 'https://a/v1/chat/completions', 'k');
    assert.deepEqual(r.models, ['a', 'b']);
    assert.ok(seen.length >= 1);
  });
  it('testConnection 回复截断 200 字', async () => {
    const http = stubHttp(() => ({
      status: 200, bodyText: JSON.stringify({ choices: [{ message: { content: 'ok'.padEnd(300, 'x') } }] }),
    }));
    const r = await testConnection(http, 'https://a/b', 'k', 'm');
    assert.equal(r.reply.length, 200);
  });
  it('payload 形状', () => {
    const p = buildChatPayload('m', 't', 'data:image/jpeg;base64,x') as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    assert.deepEqual(p.messages[0].content.map((c) => c.type), ['text', 'image_url']);
  });
});

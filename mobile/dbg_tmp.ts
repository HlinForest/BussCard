import { tokenize, tfidfScores, fuzzRatio, fuzzPartialRatio, hybridSearch } from './src/services/search.js';
import { sampleContacts } from './fixtures/fixtures.js';
import { MemDb } from './src/adapters/memory.js';
import { createContact, findDupCandidates } from './src/services/contacts.js';

const rows = sampleContacts();
console.log('toks query:', JSON.stringify(tokenize('工业机器人销售的人')));
console.log('toks doc0 head:', JSON.stringify(tokenize(rows[0].search_text).slice(0, 12)));
console.log('sem:', tfidfScores('工业机器人销售的人', rows.map((c) => c.search_text)).map((s) => s.toFixed(4)));
console.log('fn 张威/张伟:', fuzzRatio('张威', '张伟'), 'fc partial 机器人/XX机器人公司:',
  fuzzPartialRatio('机器人', 'XX机器人公司'));

const db = new MemDb();
for (const c of rows) {
  const { id: _d, created_at: _c, updated_at: _u, search_text: _s, ...rest } = c;
  await createContact(db, rest);
}
const hits = await findDupCandidates(db, { phone1: '13800138000', email: 'zw@xxrobot.com', name: '张伟', company: 'XX机器人' });
console.log('duphits:', JSON.stringify(hits.map((h) => [h.name, h.company, h.phone1, h.reason])));

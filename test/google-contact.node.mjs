import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const script = readFileSync(new URL('../integrations/google-contact/Code.js', import.meta.url), 'utf8');
const headers = ['ID', 'Created at', 'Name', 'Email', 'Message', 'Language', 'Source', 'Email sent at', 'Last error'];
const message = { id: '01010101-0101-4101-8101-010101010101', token: 'test-secret', name: '=A', email: 'visitor@example.com', message: '@hello', lang: 'ru', created_at: '2026-10-08T00:00:00Z', source: 'syuzana.com' };

function backend() {
  const rows = [[...headers]];
  const mail = [];
  let failMail = false;
  let locked = false;
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: row => rows.push(row),
    getDataRange: () => ({ getValues: () => rows.map(row => [...row]) }),
    getRange: (startRow, startColumn, height = 1, width = 1) => ({
      getValues: () => rows.slice(startRow - 1, startRow - 1 + height).map(row => row.slice(startColumn - 1, startColumn - 1 + width)),
      setValues: values => values.forEach((row, offset) => row.forEach((value, column) => { rows[startRow - 1 + offset][startColumn - 1 + column] = value; })),
      setValue: value => { rows[startRow - 1][startColumn - 1] = value; },
      createTextFinder: id => ({ matchEntireCell: () => ({ findNext: () => {
        const index = rows.findIndex((row, index) => index > 0 && row[0] === id);
        return index < 0 ? null : { getRow: () => index + 1 };
      } }) }),
    }),
  };
  const context = createContext({
    console: { error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ CONTACT_WEBHOOK_SECRET: 'test-secret', CONTACT_SPREADSHEET_ID: 'test-sheet', CONTACT_RECIPIENT: 'owner@example.com' })[key] }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => {} },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ setMimeType: () => text }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
    MailApp: { sendEmail: value => { if (failMail) throw new Error('Mail unavailable'); mail.push(value); } },
  });
  runInContext(script, context);
  return {
    rows, mail,
    post: value => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(value) } })),
    failMail: value => { failMail = value; },
    retry: () => context.retryContactMail(),
  };
}

test('authenticated capture saves text, mails with Reply-To, and deduplicates a retry', () => {
  const app = backend();
  assert.deepEqual(app.post(message), { ok: true, stored: true, notified: true });
  assert.equal(app.rows.length, 2);
  assert.equal(app.rows[1][2], "'=A");
  assert.equal(app.rows[1][4], "'@hello");
  assert.equal(app.mail[0].replyTo, message.email);
  assert.match(app.mail[0].body, /@hello/);
  // Match Google's readback when it consumes the text-prefix apostrophe.
  app.rows[1][2] = '=A';
  app.rows[1][4] = '@hello';
  assert.deepEqual(app.post({ ...message, created_at: '2026-10-08T01:00:00Z' }), { ok: true, stored: true, notified: true });
  assert.equal(app.rows.length, 2);
  assert.equal(app.mail.length, 1);
});

test('failed mail keeps a pending row and retries without a second row', () => {
  const app = backend();
  app.failMail(true);
  assert.deepEqual(app.post(message), { ok: false, stored: true, notified: false });
  assert.equal(app.rows[1][7], '');
  app.failMail(false);
  app.retry();
  app.retry();
  assert.equal(app.rows.length, 2);
  assert.equal(app.mail.length, 1);
  assert.ok(app.rows[1][7]);
  assert.equal(app.rows[1][8], '');
});

test('wrong authentication and invalid submissions cause no external writes', () => {
  const app = backend();
  assert.equal(app.post({ ...message, token: 'wrong' }).ok, false);
  assert.equal(app.post({ ...message, email: 'invalid' }).ok, false);
  assert.equal(app.rows.length, 1);
  assert.equal(app.mail.length, 0);
});

test('reusing an ID with different content cannot replace the saved message', () => {
  const app = backend();
  app.post(message);
  assert.deepEqual(app.post({ ...message, message: 'different' }), { ok: false, error: 'id_conflict' });
  assert.equal(app.rows[1][4], "'@hello");
  assert.equal(app.mail.length, 1);
});

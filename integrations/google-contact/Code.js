/** Contact capture runs as the site owner. Configuration stays in Script Properties. */
const CONTACT_HEADERS = ['ID', 'Created at', 'Name', 'Email', 'Message', 'Language', 'Source', 'Email sent at', 'Last error'];
const CONTACT_SHEET_NAME = 'Messages';
const CONTACT_LOCK_MS = 5000;
const CONTACT_LIMITS = { name: 120, email: 254, message: 4000 };
const CONTACT_RETRY_BATCH = 10;

function contactConfig() {
  const properties = PropertiesService.getScriptProperties();
  const config = {
    secret: properties.getProperty('CONTACT_WEBHOOK_SECRET'),
    spreadsheetId: properties.getProperty('CONTACT_SPREADSHEET_ID'),
    recipient: properties.getProperty('CONTACT_RECIPIENT'),
  };
  if (!config.secret || !config.spreadsheetId || !config.recipient) throw new Error('Missing contact configuration');
  return config;
}

function contactSheet(config) {
  const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(CONTACT_SHEET_NAME);
  if (!sheet || sheet.getRange(1, 1, 1, CONTACT_HEADERS.length).getValues()[0].join('|') !== CONTACT_HEADERS.join('|')) {
    throw new Error('Unexpected contact sheet schema');
  }
  return sheet;
}

function contactJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function validContact(message) {
  return message && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(message.id) &&
    ['name', 'email', 'message'].every(function (key) {
      return typeof message[key] === 'string' && message[key].trim() && message[key].length <= CONTACT_LIMITS[key] + 1;
    }) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.email) &&
    ['en', 'ru'].indexOf(message.lang) !== -1 && message.source === 'syuzana.com' &&
    typeof message.created_at === 'string' && !isNaN(Date.parse(message.created_at));
}

/** Store text even if a request bypasses the Worker's formula guard. */
function contactText(value) {
  return /^[=+\-@]/.test(value.trimStart()) ? "'" + value : value;
}

/** Sheets may consume the text-prefix apostrophe on write. */
function contactComparable(value) {
  return String(value).replace(/^'(?=[=+\-@])/, '');
}

/** Persist a receipt only after MailApp accepts the notification. */
function sendContactMail(sheet, row, config) {
  const values = sheet.getRange(row, 1, 1, CONTACT_HEADERS.length).getValues()[0];
  if (values[7]) return true;
  try {
    MailApp.sendEmail({
      to: config.recipient,
      replyTo: String(values[3]),
      subject: 'syuzana.com: new contact message',
      body: 'From: ' + values[2] + ' <' + values[3] + '>\n' +
        'Language: ' + values[5] + '\nCreated at: ' + values[1] + '\n' +
        'Message ID: ' + values[0] + '\n\n' + values[4],
    });
    sheet.getRange(row, 8, 1, 2).setValues([[new Date().toISOString(), '']]);
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    sheet.getRange(row, 9).setValue('Mail submission failed');
    console.error('contact_mail_failed');
    return false;
  }
}

/** A row and email receipt are required before the Worker can show success. */
function doPost(event) {
  let stored = false;
  const lock = LockService.getScriptLock();
  try {
    const config = contactConfig();
    const message = JSON.parse(event.postData.contents);
    if (message.token !== config.secret) return contactJson({ ok: false, error: 'unauthorized' });
    if (!validContact(message)) return contactJson({ ok: false, error: 'invalid' });
    if (!lock.tryLock(CONTACT_LOCK_MS)) return contactJson({ ok: false, error: 'busy' });
    const sheet = contactSheet(config);
    const lastRow = sheet.getLastRow();
    const found = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1)
      .createTextFinder(message.id).matchEntireCell(true).findNext() : null;
    let row;
    const fields = [contactText(message.name), contactText(message.email), contactText(message.message), message.lang, message.source];
    if (found) {
      row = found.getRow();
      const saved = sheet.getRange(row, 3, 1, fields.length).getValues()[0];
      if (saved.map(contactComparable).join('\u0000') !== fields.map(contactComparable).join('\u0000')) {
        return contactJson({ ok: false, error: 'id_conflict' });
      }
    } else {
      sheet.appendRow([message.id, message.created_at].concat(fields, ['', '']));
      row = sheet.getLastRow();
      SpreadsheetApp.flush();
    }
    stored = true;
    const notified = sendContactMail(sheet, row, config);
    return contactJson({ ok: notified, stored: true, notified: notified });
  } catch (error) {
    console.error('contact_delivery_failed');
    return contactJson({ ok: false, stored: stored, notified: false, error: 'delivery_failed' });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/** Retry pending mail after transient failures, including requests whose visitor has left. */
function retryContactMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONTACT_LOCK_MS)) return;
  try {
    const config = contactConfig();
    const sheet = contactSheet(config);
    const pending = sheet.getDataRange().getValues().slice(1);
    let attempted = 0;
    pending.forEach(function (row, index) {
      if (row[0] && !row[7] && attempted < CONTACT_RETRY_BATCH) {
        attempted++;
        sendContactMail(sheet, index + 2, config);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the Apps Script editor to authorize mail/sheets and install retry delivery. */
function authorizeContactDelivery() {
  const config = contactConfig();
  contactSheet(config);
  MailApp.getRemainingDailyQuota();
  const installed = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'retryContactMail';
  });
  if (!installed) ScriptApp.newTrigger('retryContactMail').timeBased().everyMinutes(5).create();
}

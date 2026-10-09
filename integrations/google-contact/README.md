# Contact Delivery: Google Sheets and Email

The Worker validates a visitor’s submission and posts it to an authenticated Apps Script
web app. The app saves a row in a private Google Sheet and submits an email to the owner
through `MailApp`, with the visitor’s address as `Reply-To`.

The Worker acknowledges success only when the JSON receipt confirms both operations.
An unchanged draft reuses its message ID on retry.
The Apps Script serializes writes and reuses an existing row and mail receipt.
Pending mail is retried every five minutes; the sheet records its status.
A process failure between mail acceptance and receipt persistence can cause a duplicate
notification on retry.

## Google Setup

1. Create a private spreadsheet with a tab named `Applications`. Set the first row to:
   `ID | Created at | Name | Email | Message | Language | Source | Email sent at | Last error`.
2. Create an Apps Script project and copy `Code.js` and `appsscript.json` into it.
3. In Project Settings, set Script Properties:
   - `CONTACT_SPREADSHEET_ID`: spreadsheet ID
   - `CONTACT_RECIPIENT`: the owner’s notification email
   - `CONTACT_WEBHOOK_SECRET`: a random shared token
4. Run `authorizeContactDelivery` from the editor.
   Authorize spreadsheet access, mail sending and both time-based triggers for the
   owner’s account.
5. Deploy a web app: execute as the owner, access **Anyone**. The shared token protects
   writes; the URL and token are never sent to visitors.
6. Set Worker secrets `CONTACT_WEBHOOK_URL` (the deployed `/exec` URL) and
   `CONTACT_WEBHOOK_SECRET` (the same token), then deploy the Worker.

The form is visible with its Send button disabled until both Worker secrets are present.
While sending is unavailable, it offers the owner’s configured email and Telegram links.
Test a submission through the site, then verify its single row, its `Email sent at`
value, and the notification in the owner’s mailbox.
Retry the same ID to verify deduplication.

## Abuse Watch

The scarce resource is the consumer `MailApp` quota, roughly 100 messages a day. It is
not bandwidth that takes the form down: once the quota is gone, every real visitor sees
an error until it resets, because the Worker acknowledges success only on a mail receipt.
Cloudflare's free plan raises no alert for this, so `contactWatch` does, hourly.

It emails the owner once a day when submissions in the last 24 hours exceed
`CONTACT_WATCH.dailyRows`, or when fewer than `CONTACT_WATCH.quotaFloor` messages remain.
The floor is deliberately well above zero: the alert spends a message from the very quota
it reports, so it has to fire while sending still works. `CONTACT_ALERT_DATE` in Script
Properties holds the day already alerted, and is claimed before the send so a failure
cannot retry every hour.

Treat an alert as the signal to act on `syusite-d7rv`, not as an incident in itself: a
burst of genuine interest looks the same from here.

## Verification and Recovery

`npm test` runs the Worker tests and `node --test test/google-contact.node.mjs`. The
Apps Script tests exercise saved rows, mail receipts, retries, authentication, formula
escaping and conflicting IDs with Google service doubles.
A live submission is required to verify Google authorization and actual mail delivery.

If notification submission fails, the row remains pending and the scheduled retry runs
without requiring the visitor to return.
Check `Last error`, Apps Script Executions and mail quota.
Do not delete pending rows before resolving delivery.
Rotate the shared token in both Script Properties and Worker secrets if exposed.
Disabling the webhook or token disables Send; a previous Worker version can be restored
through Cloudflare deployment history.

See [Google’s web app guide](https://developers.google.com/apps-script/guides/web) and
[MailApp reference](https://developers.google.com/apps-script/reference/mail/mail-app).

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->

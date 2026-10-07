# Changelog

## 2.1.0 (Unreleased)

- Add authenticated contact-form delivery to a private Google Sheet and an email
  notification with the visitor’s address as Reply-To.
- Require confirmation of both operations before showing success.
  Preserve drafts on error, deduplicate retries and retry pending mail after a temporary
  failure.
- Display the Telegram channel handle as a link and support personal Telegram links in
  the contact list and footer.

Production delivery and the personal Telegram value await owner configuration.

## 2.0.0

- Implement the front end according to visit-card mockup v14: typography, colours,
  responsive sheet, equal action buttons, contact rows, language switch and footer.
- Include the sanitized v14 HTML mockup and its specification in git as part of the
  requirements under `specs/mockup/`.
- Add email copying and the interface for in-page form submission.
  Form delivery remains disabled until configured; it is scheduled for release 2.1.0.

Existing tags `v2.0` and `v2.1` identify earlier iterations.
The requested release series uses `v2.0.0` and `v2.1.0` to preserve those references.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->

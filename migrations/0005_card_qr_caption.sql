-- The QR caption on the card. The code itself is drawn server-side from contacts.*.

INSERT OR IGNORE INTO content (key, lang, value, updated_at)
  VALUES ('card.qr_title', 'en', 'Scan to save my contact', '1970-01-01T00:00:00Z');

INSERT OR IGNORE INTO content (key, lang, value, updated_at)
  VALUES ('card.qr_note', 'en', 'Opens a vCard on the phone, no typing needed. Useful when this page is on a screen someone else is looking at.', '1970-01-01T00:00:00Z');

INSERT OR IGNORE INTO content (key, lang, value, updated_at)
  VALUES ('card.qr_title', 'ru', 'Отсканируйте, чтобы сохранить контакт', '1970-01-01T00:00:00Z');

INSERT OR IGNORE INTO content (key, lang, value, updated_at)
  VALUES ('card.qr_note', 'ru', 'Открывает vCard на телефоне, ничего не нужно набирать. Полезно, когда страницу видят на чужом экране.', '1970-01-01T00:00:00Z');

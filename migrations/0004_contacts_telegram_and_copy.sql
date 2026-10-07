-- Adds the personal Telegram handle, which footer.telegram_label had no key to point at.
-- Also refreshes the copy changed in commits 3837048 and 73797a1, but only where the row
-- still holds the previously seeded value, so anything edited in the admin is left alone.

INSERT OR IGNORE INTO content (key, lang, value, updated_at)
  VALUES ('contacts.telegram', '*', '{{SET_IN_ADMIN}}', '1970-01-01T00:00:00Z');

UPDATE content SET value = '- AI monitoring for greenhouses: of more than ten detection models we kept the four that worked and rebuilt labelling. Average production accuracy went from 0.6 to 0.9, manual annotation fell by about 95%.
- Multi-tenant infrastructure: a move to shared services cut cloud cost per customer by roughly 10x and turned the unit economics positive.
- Government analytics: an NLP system for 200–250 thousand citizen requests a year, doing classification, entity extraction and routing. Processing became about 5x faster, with a person making the final call.
- Mobility data: moving from row-based to vector-based storage took a report from about three days to an hour and a half.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'experience.items' AND lang = 'en' AND value = '- AI monitoring for greenhouses: of more than ten detection models we kept the four that worked and rebuilt labelling — average production accuracy went from 0.6 to 0.9, manual annotation fell by about 95%.
- Same team: a move to shared services and multi-tenant infrastructure cut cloud cost per customer by roughly 10x and turned the unit economics positive.
- Government analytics: an NLP system for 200–250 thousand citizen requests a year — classification, entity extraction, routing; processing became about 5x faster, with a person making the final call.
- Mobility data: moving from row-based to vector-based storage took a report from about three days to an hour and a half.';

UPDATE content SET value = 'I''m a product lead with a technical background. I help find the product''s focus and decide whether it is worth doing. I research its value, the market, the audience and the competition. I work out whether the product pays back, and define how it should be built. I write the growth strategy and see development through to launch.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'about.bio' AND lang = 'en' AND value = 'Technical product owner: I take AI and data products from the decision to a working system, and I count what they cost to run.';

UPDATE content SET value = 'First consultation | 20–40 minutes, free | –
Consultation | 1 hour, €150 | within a week
Consultation with a written review | from 3 hours, from €350 | within a week
Single task | from 2 hours | by agreement
Audit of a live AI product | from 20 hours | 1–2 weeks
Assessment of a new product or direction | from 30 hours | 2–4 weeks
Part-time product lead | 4 or 8 days a month | from 1 month
Full time | full days | on request', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'pricing.rows' AND lang = 'en' AND value = 'First consultation | 20–40 minutes, free | —
Consultation | 1 hour, €150 | within a week
Consultation with a written review | from 3 hours, from €350 | within a week
Single task | from 2 hours | by agreement
Audit of a live AI product | from 20 hours | 1–2 weeks
Assessment of a new product or direction | from 30 hours | 2–4 weeks
Part-time product lead | 4 or 8 days a month | from 1 month
Full time | full days | on request';

UPDATE content SET value = 'Thank you. I''ll reply within two working days.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'contact.form_ok' AND lang = 'en' AND value = 'Thank you — I''ll reply within two working days.';

UPDATE content SET value = '- AI-мониторинг для теплиц: из более чем десяти моделей оставили четыре рабочие, перестроили разметку. Средняя точность в production выросла с 0.6 до 0.9, ручной разметки стало меньше примерно на 95%.
- Мультитенантная инфраструктура: после перехода на общие сервисы облачные расходы на клиента снизились примерно в 10 раз, экономика стала положительной.
- Государственная аналитика: NLP-система для 200–250 тысяч обращений в год, которая делает классификацию, извлечение сущностей и маршрутизацию. Обработка ускорилась примерно в 5 раз, итоговое решение осталось за человеком.
- Данные о мобильности: после перехода с построчного хранения на векторное отчёт, который строился около трёх дней, стал строиться за полтора часа.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'experience.items' AND lang = 'ru' AND value = '- AI-мониторинг для теплиц: из более чем десяти моделей оставили четыре рабочие, перестроили разметку — средняя точность в production выросла с 0.6 до 0.9, ручной разметки стало меньше примерно на 95%.
- Та же команда: переход на общие сервисы и мультитенантную инфраструктуру — облачные расходы на клиента снизились примерно в 10 раз, экономика стала положительной.
- Государственная аналитика: NLP-система для 200–250 тысяч обращений в год — классификация, извлечение сущностей, маршрутизация; обработка ускорилась примерно в 5 раз, итоговое решение осталось за человеком.
- Данные о мобильности: переход с построчного хранения на векторное — отчёт, который строился около трёх дней, стал строиться за полтора часа.';

UPDATE content SET value = 'Я руководитель продукта с техническим опытом. Помогаю найти фокус продукта и понять, стоит ли его делать. Исследую ценность, рынок, аудиторию и конкурентов. Считаю, окупится ли продукт, и определяю, каким он должен быть технически. Составляю стратегию развития и сопровождаю разработку до запуска.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'about.bio' AND lang = 'ru' AND value = 'Технический продакт-оунер: веду AI- и дата-продукты от решения до работающей системы и считаю, во что они обходятся в эксплуатации.';

UPDATE content SET value = 'Первая консультация | 20–40 минут, бесплатно | –
Консультация | 1 час, €150 | в течение недели
Консультация с письменным разбором | от 3 часов, от €350 | в течение недели
Отдельная задача | от 2 часов | по договорённости
Аудит действующего AI-продукта | от 20 часов | 1–2 недели
Оценка нового продукта или направления | от 30 часов | 2–4 недели
Продакт-лид на частичную занятость | 4 или 8 дней в месяц | от 1 месяца
Полная занятость | полный день | по запросу', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'pricing.rows' AND lang = 'ru' AND value = 'Первая консультация | 20–40 минут, бесплатно | —
Консультация | 1 час, €150 | в течение недели
Консультация с письменным разбором | от 3 часов, от €350 | в течение недели
Отдельная задача | от 2 часов | по договорённости
Аудит действующего AI-продукта | от 20 часов | 1–2 недели
Оценка нового продукта или направления | от 30 часов | 2–4 недели
Продакт-лид на частичную занятость | 4 или 8 дней в месяц | от 1 месяца
Полная занятость | полный день | по запросу';

UPDATE content SET value = 'Спасибо. Отвечу в течение двух рабочих дней.', updated_at = '2026-10-07T00:00:00Z'
  WHERE key = 'contact.form_ok' AND lang = 'ru' AND value = 'Спасибо — отвечу в течение двух рабочих дней.';

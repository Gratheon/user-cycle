SET NAMES utf8mb4;

-- Exported from local translations added after prod marker: id=15138, key="Add Existing Queen".
-- Keep this migration idempotent because production and local auto-increment ids differ.

-- Source translation id 561: Select Queen
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Select Queen' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Select Queen', NULL, NULL, '2026-06-20 11:52:06'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Select Queen' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Выберите матку')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 562: Shared links
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Shared links' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Shared links', NULL, NULL, '2026-06-20 12:05:55'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Shared links' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Общие ссылки')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 563: You can share access to hive inspections with other people. This list shows list of such shared tokens
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'You can share access to hive inspections with other people. This list shows list of such shared tokens' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'You can share access to hive inspections with other people. This list shows list of such shared tokens', NULL, NULL, '2026-06-20 12:05:59'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'You can share access to hive inspections with other people. This list shows list of such shared tokens' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Вы можете поделиться доступом к осмотрам ульев с другими людьми. В этом списке отображаются все такие общие токены.')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 564: Toggle
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Toggle' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Toggle', NULL, NULL, '2026-06-20 12:06:15'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Toggle' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Переключить')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 565: Revoke
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Revoke' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Revoke', NULL, NULL, '2026-06-20 12:06:20'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Revoke' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Отозвать')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 566: Access scope
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Access scope' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Access scope', NULL, NULL, '2026-06-20 12:06:24'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Access scope' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Права доступа')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 567: Copy
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Copy' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Copy', NULL, NULL, '2026-06-20 12:06:33'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Copy' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Копировать')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 568: Monthly
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Monthly' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Monthly', NULL, NULL, '2026-06-20 12:16:31'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Monthly' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Ежемесячно')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 569: Yearly
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Yearly' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Yearly', NULL, NULL, '2026-06-20 12:16:35'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Yearly' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'За год')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 570: years
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'years' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'years', NULL, NULL, '2026-06-20 12:33:20'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'years' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Годы')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 571: Unknown Race
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Unknown Race' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Unknown Race', NULL, NULL, '2026-06-20 12:33:45'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Unknown Race' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Неизвестная порода')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

-- Source translation id 572: Race unknown
SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Race unknown' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translations (`key`, namespace, context, date_added)
SELECT 'Race unknown', NULL, NULL, '2026-06-20 12:37:08'
WHERE @translation_id IS NULL;

SET @translation_id := (
  SELECT id FROM translations WHERE `key` = 'Race unknown' AND namespace <=> NULL ORDER BY id LIMIT 1
);

INSERT INTO translation_values (translation_id, lang, value)
VALUES (@translation_id, 'ru', 'Порода неизвестна')
ON DUPLICATE KEY UPDATE value = VALUES(value), date_updated = NOW();

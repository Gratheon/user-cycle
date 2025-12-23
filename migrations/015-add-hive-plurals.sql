-- Migration to add plural forms for "hive" translation
-- Run this in the user-cycle database

-- Add plural forms for "hive" (ID 617 based on logs)
INSERT INTO plural_forms (translation_id, lang, plural_data) VALUES
  (617, 'en', '{"one": "hive", "other": "hives"}'),
  (617, 'ru', '{"one": "улей", "few": "улья", "many": "ульев"}'),
  (617, 'et', '{"one": "mesikonn", "other": "mesikonnid"}'),
  (617, 'tr', '{"one": "kovan", "other": "kovanlar"}'),
  (617, 'pl', '{"one": "ul", "few": "ule", "many": "ulów"}'),
  (617, 'de', '{"one": "Bienenstock", "other": "Bienenstöcke"}'),
  (617, 'fr', '{"one": "ruche", "other": "ruches"}')
ON DUPLICATE KEY UPDATE
  plural_data = VALUES(plural_data),
  date_updated = NOW();

-- Verify the plural forms were added
SELECT
  t.id,
  t.`key`,
  pf.lang,
  pf.plural_data
FROM translations t
JOIN plural_forms pf ON pf.translation_id = t.id
WHERE t.`key` = 'Hive'
ORDER BY pf.lang;

-- Expected output: 7 rows (one for each language)


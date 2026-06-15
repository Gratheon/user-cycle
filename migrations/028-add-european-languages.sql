SET NAMES utf8mb4;

SET @db_name := DATABASE();

SET @has_lv := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'lv'
);
SET @add_lv_sql := IF(
  @has_lv = 0,
  'ALTER TABLE `locales` ADD COLUMN `lv` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `fr`',
  'SELECT 1'
);
PREPARE stmt FROM @add_lv_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_lt := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'lt'
);
SET @add_lt_sql := IF(
  @has_lt = 0,
  'ALTER TABLE `locales` ADD COLUMN `lt` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `lv`',
  'SELECT 1'
);
PREPARE stmt FROM @add_lt_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_hu := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'hu'
);
SET @add_hu_sql := IF(
  @has_hu = 0,
  'ALTER TABLE `locales` ADD COLUMN `hu` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `lt`',
  'SELECT 1'
);
PREPARE stmt FROM @add_hu_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_uk := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'uk'
);
SET @add_uk_sql := IF(
  @has_uk = 0,
  'ALTER TABLE `locales` ADD COLUMN `uk` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `hu`',
  'SELECT 1'
);
PREPARE stmt FROM @add_uk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_it := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'it'
);
SET @add_it_sql := IF(
  @has_it = 0,
  'ALTER TABLE `locales` ADD COLUMN `it` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `uk`',
  'SELECT 1'
);
PREPARE stmt FROM @add_it_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ro := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'ro'
);
SET @add_ro_sql := IF(
  @has_ro = 0,
  'ALTER TABLE `locales` ADD COLUMN `ro` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `it`',
  'SELECT 1'
);
PREPARE stmt FROM @add_ro_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `plural_rules` (`lang`, `forms`) VALUES
  ('lv', '["zero", "one", "other"]'),
  ('lt', '["one", "few", "many", "other"]'),
  ('hu', '["one", "other"]'),
  ('uk', '["one", "few", "many", "other"]'),
  ('it', '["one", "other"]'),
  ('ro', '["one", "few", "other"]')
ON DUPLICATE KEY UPDATE forms = VALUES(forms);

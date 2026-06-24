SET NAMES utf8mb4;

SET @db_name := DATABASE();

SET @has_he := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'he'
);
SET @add_he_sql := IF(
  @has_he = 0,
  'ALTER TABLE `locales` ADD COLUMN `he` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `ro`',
  'SELECT 1'
);
PREPARE stmt FROM @add_he_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ko := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'ko'
);
SET @add_ko_sql := IF(
  @has_ko = 0,
  'ALTER TABLE `locales` ADD COLUMN `ko` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `he`',
  'SELECT 1'
);
PREPARE stmt FROM @add_ko_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_nl := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db_name AND table_name = 'locales' AND column_name = 'nl'
);
SET @add_nl_sql := IF(
  @has_nl = 0,
  'ALTER TABLE `locales` ADD COLUMN `nl` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `ko`',
  'SELECT 1'
);
PREPARE stmt FROM @add_nl_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `plural_rules` (`lang`, `forms`) VALUES
  ('he', '["one", "two", "other"]'),
  ('ko', '["other"]'),
  ('nl', '["one", "other"]')
ON DUPLICATE KEY UPDATE forms = VALUES(forms);

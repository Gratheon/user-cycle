SET NAMES utf8mb4;

SET @db_name := DATABASE();
SET @has_locale := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'account'
    AND column_name = 'locale'
);
SET @add_locale_sql := IF(
  @has_locale = 0,
  'ALTER TABLE `account` ADD COLUMN `locale` VARCHAR(35) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `lang`',
  'SELECT 1'
);
PREPARE stmt FROM @add_locale_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

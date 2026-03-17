SET NAMES utf8mb4;

SET @db_name := DATABASE();

SET @has_unique_key := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'translations'
    AND index_name = 'unique_key'
);
SET @drop_unique_key_sql := IF(
  @has_unique_key > 0,
  'ALTER TABLE `translations` DROP INDEX `unique_key`',
  'SELECT 1'
);
PREPARE stmt FROM @drop_unique_key_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_unique_key_namespace := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'translations'
    AND index_name = 'unique_key_namespace'
);
SET @drop_unique_key_namespace_sql := IF(
  @has_unique_key_namespace > 0,
  'ALTER TABLE `translations` DROP INDEX `unique_key_namespace`',
  'SELECT 1'
);
PREPARE stmt FROM @drop_unique_key_namespace_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `translations`
  MODIFY COLUMN `key` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

SET @has_key_hash := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'translations'
    AND column_name = 'key_hash'
);
SET @add_key_hash_sql := IF(
  @has_key_hash = 0,
  'ALTER TABLE `translations` ADD COLUMN `key_hash` CHAR(64) GENERATED ALWAYS AS (SHA2(`key`, 256)) STORED AFTER `key`',
  'SELECT 1'
);
PREPARE stmt FROM @add_key_hash_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_unique_key_namespace_hash := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'translations'
    AND index_name = 'unique_key_namespace_hash'
);
SET @add_unique_key_namespace_hash_sql := IF(
  @has_unique_key_namespace_hash = 0,
  'ALTER TABLE `translations` ADD UNIQUE KEY `unique_key_namespace_hash` (`key_hash`, `namespace`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_unique_key_namespace_hash_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_key_namespace_prefix := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'translations'
    AND index_name = 'idx_key_namespace_prefix'
);
SET @add_idx_key_namespace_prefix_sql := IF(
  @has_idx_key_namespace_prefix = 0,
  'ALTER TABLE `translations` ADD INDEX `idx_key_namespace_prefix` (`key`(191), `namespace`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_idx_key_namespace_prefix_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

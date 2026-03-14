SET NAMES utf8mb4;

ALTER TABLE `translations`
  MODIFY COLUMN `key` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE `translations`
  ADD COLUMN `key_hash` CHAR(64)
    GENERATED ALWAYS AS (SHA2(`key`, 256))
    STORED
    AFTER `key`;

ALTER TABLE `translations`
  DROP INDEX `unique_key_namespace`,
  ADD UNIQUE KEY `unique_key_namespace_hash` (`key_hash`, `namespace`),
  ADD INDEX `idx_key_namespace_prefix` (`key`(191), `namespace`);

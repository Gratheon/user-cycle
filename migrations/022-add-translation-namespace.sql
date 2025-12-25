SET NAMES utf8mb4;

ALTER TABLE `translations`
  ADD COLUMN `namespace` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `key`;

ALTER TABLE `translations`
  DROP INDEX `unique_key`,
  ADD UNIQUE KEY `unique_key_namespace` (`key`, `namespace`);

CREATE INDEX `idx_namespace` ON `translations` (`namespace`);


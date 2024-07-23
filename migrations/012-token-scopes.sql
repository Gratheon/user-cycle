CREATE TABLE `share_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token` char(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `user_id` int DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `date_deleted` datetime DEFAULT NULL,
  `date_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `account_id` (`user_id`),
  CONSTRAINT `share_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `account` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `share_tokens` ADD UNIQUE INDEX (`token`);

ALTER TABLE `api_tokens` ADD UNIQUE INDEX (`token`);
ALTER TABLE `api_tokens` CHANGE `date_added` `date_added` DATETIME  NULL  ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `api_tokens` ADD `date_deleted` DATETIME  NULL  AFTER `date_added`;
ALTER TABLE `api_tokens` CHANGE `date_added` `date_added` DATETIME  NOT NULL  DEFAULT CURRENT_TIMESTAMP;

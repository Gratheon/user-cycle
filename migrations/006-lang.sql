ALTER TABLE `account` ADD `lang` VARCHAR(2)  CHARACTER SET utf8mb4  COLLATE utf8mb4_general_ci NOT NULL  DEFAULT 'en'  AFTER `date_expiration`;

CREATE TABLE IF NOT EXISTS `locales` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `en` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ru` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `et` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `translation_context` tinytext COLLATE utf8mb4_general_ci,
  `date_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`key`),
  UNIQUE KEY `key` (`key`,`en`),
  KEY `en` (`en`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
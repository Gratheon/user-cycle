CREATE TABLE IF NOT EXISTS `password_reset_token` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_token_hash_unique` (`token_hash`),
  KEY `password_reset_token_user_id_idx` (`user_id`),
  KEY `password_reset_token_expires_at_idx` (`expires_at`),
  CONSTRAINT `password_reset_token_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `account` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `password_reset_request_limit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `identity_hash` char(64) NOT NULL,
  `request_date` date NOT NULL,
  `request_count` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_request_limit_identity_date_unique` (`identity_hash`, `request_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

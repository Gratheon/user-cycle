CREATE TABLE IF NOT EXISTS `billing_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `event_type` ENUM('registration', 'subscription_created', 'subscription_cancelled', 'subscription_expired', 'tier_changed', 'payment_succeeded', 'payment_failed') NOT NULL,
  `billing_plan` ENUM('free','starter','professional','addon','enterprise') DEFAULT NULL,
  `details` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `billing_history_user_fk` FOREIGN KEY (`user_id`) REFERENCES `account` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Create initial registration entries for existing users
-- Map old enum values to new ones during backfill
INSERT INTO `billing_history` (`user_id`, `event_type`, `billing_plan`, `details`, `created_at`)
SELECT
  id as user_id,
  'registration' as event_type,
  CASE
    WHEN billing_plan = 'base' THEN 'starter'
    WHEN billing_plan = 'pro' THEN 'professional'
    ELSE 'free'
  END as billing_plan,
  'Initial registration' as details,
  date_added as created_at
FROM `account`;


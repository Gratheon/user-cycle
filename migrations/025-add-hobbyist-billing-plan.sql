-- Add hobbyist tier between free and starter

ALTER TABLE `account`
MODIFY COLUMN `billing_plan`
ENUM('free','hobbyist','starter','professional','addon','enterprise')
NOT NULL DEFAULT 'free';

ALTER TABLE `billing_history`
MODIFY COLUMN `billing_plan`
ENUM('free','hobbyist','starter','professional','addon','enterprise')
DEFAULT NULL;

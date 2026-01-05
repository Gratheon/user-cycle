-- Update billing_plan enum to match current tier names
-- Migration from: 'free','base','pro'
-- Migration to: 'free','starter','professional','addon','enterprise'

-- Step 1: Add new values to the enum
ALTER TABLE `account`
MODIFY COLUMN `billing_plan`
ENUM('free','base','pro','starter','professional','addon','enterprise')
NOT NULL DEFAULT 'free';

-- Step 2: Migrate existing data
-- 'base' -> 'starter'
UPDATE `account` SET `billing_plan` = 'starter' WHERE `billing_plan` = 'base';

-- 'pro' -> 'professional'
UPDATE `account` SET `billing_plan` = 'professional' WHERE `billing_plan` = 'pro';

-- Step 3: Update billing_history records to match new names
UPDATE `billing_history` SET `billing_plan` = 'starter' WHERE `billing_plan` = 'base';
UPDATE `billing_history` SET `billing_plan` = 'professional' WHERE `billing_plan` = 'pro';

-- Step 4: Remove old enum values (only keep new ones)
ALTER TABLE `account`
MODIFY COLUMN `billing_plan`
ENUM('free','starter','professional','addon','enterprise')
NOT NULL DEFAULT 'free';

-- Step 5: Update default from 'base' to 'free'
ALTER TABLE `account`
ALTER COLUMN `billing_plan` SET DEFAULT 'free';


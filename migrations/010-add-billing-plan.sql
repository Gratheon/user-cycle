ALTER TABLE `account` 
ADD `billing_plan` 
ENUM('free','base','pro') 
NOT NULL  DEFAULT 'base'  AFTER `lang`;

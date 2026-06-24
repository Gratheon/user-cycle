SET NAMES utf8mb4;

SET @db_name := DATABASE();
SET @has_temperature_unit := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'account'
    AND column_name = 'temperature_unit'
);
SET @add_temperature_unit_sql := IF(
  @has_temperature_unit = 0,
  'ALTER TABLE `account` ADD COLUMN `temperature_unit` ENUM(''celsius'', ''fahrenheit'') NOT NULL DEFAULT ''celsius'' AFTER `locale`',
  'SELECT 1'
);
PREPARE stmt FROM @add_temperature_unit_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

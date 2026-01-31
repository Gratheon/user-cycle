import config from "../config/index";
import { createLogger } from "@gratheon/log-lib";

const { logger } = createLogger({
  mysql: {
    host: config.mysql.host,
    port: parseInt(config.mysql.port, 10),
    user: config.mysql.user,
    password: config.mysql.password,
    database: 'logs',
  },
});

export { logger };

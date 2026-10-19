import config from './config.default';

const testConfig = {
  ...config,
  postgres: {
    ...config.postgres,
    host: '127.0.0.1',
    port: '5432',
    user: 'test',
    password: 'test',
    database: 'user_cycle',
    ssl: 'disable',
  },
  schemaRegistryHost: 'http://127.0.0.1:3999',
  selfUrl: 'http://127.0.0.1:4000',
  stripe: {
    ...config.stripe,
    selfUrl: 'http://127.0.0.1:4000',
    appUrl: 'http://127.0.0.1:8080',
  },
};

export default testConfig;

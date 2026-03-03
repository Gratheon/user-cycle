import config from './config.default';

const testConfig = {
  ...config,
  mysql: {
    ...config.mysql,
    host: '127.0.0.1',
    port: '3306',
    user: 'test',
    password: 'test',
    database: 'user-cycle',
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

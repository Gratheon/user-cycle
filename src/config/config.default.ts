const config = {
  sentryDsn: "",
  schemaRegistryHost: `http://gql-schema-registry:3000`,
  selfUrl: "user-cycle:4000",
  postgres: {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || '5432',
    user: process.env.DB_USER || 'test',
    password: process.env.DB_PASSWORD || 'test',
    database: process.env.DB_NAME || 'user_cycle',
    // disable | prefer | require | no-verify
    ssl: process.env.DB_SSL || 'prefer',
  },

  redis: {
    url: 'redis://:pass@redis:6379',
    translationCacheEnabled: process.env.TRANSLATION_REDIS_ENABLED !== 'false',
    translationKeyPrefix: process.env.TRANSLATION_REDIS_KEY_PREFIX || 'user-cycle:translation:v1:',
    translationTtlSeconds: Number(process.env.TRANSLATION_REDIS_TTL_SECONDS || 3600),
  },

  aws: {
    region: 'eu-west-1',
    accessKeyId: '',
    secretAccessKey: '',
    sesFromEmail: 'pilot@gratheon.com'
  },


  stripe: {
    selfUrl: 'http://localhost:4000',
    appUrl: 'http://localhost:8080',

    secret: 'sk_test_51SNHuWHe2QIxNzEcseznVsu41HGtp6dzRAdiQ8mXR9N3PVa2K3MdsVBra9FclAn8tWwML08HYbolLxx5xu8TAjY600brzrTDnl',
    webhook_secret: '',

    plans: {
      hobbyist: {
        monthly: 'price_hobbyist_monthly_placeholder',
        yearly: 'price_hobbyist_yearly_placeholder'
      },
      starter: {
        monthly: 'price_1Sm0eIHe2QIxNzEc2BQwdPL3',
        yearly: 'price_1Sm0eIHe2QIxNzEcvDZEpjDa'
      },
      professional: {
        monthly: 'price_1SNII6He2QIxNzEcSooFStci',
        yearly: 'price_1Sm0h9He2QIxNzEcT7FYLOZL'
      },
      addon: {
        oneTime: 'price_addon_onetime_placeholder'
      }
    }
  },


  // this must match graphql-router
  JWT_KEY: 'okzfERFAXXbRTQWkGFfjo3EcAXjRijnGnaAMEsTXnmdjAVDkQrfyLzscPwUiymbj',
  SENDGRID_API_KEY: '',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    translationModel: process.env.ANTHROPIC_TRANSLATION_MODEL || 'claude-haiku-5-5'
  },

  google_oauth: {
    'client_id': '',
    'client_secret': '',
    'redirect_url': 'http://localhost:4000/auth/google/callback'
  },

  login_ui_url: 'http://localhost:8080/account/authenticate/',
  app_ui_url: 'http://localhost:8080/apiaries',
  password_reset_ui_url: process.env.PASSWORD_RESET_UI_URL || (process.env.ENV_ID === 'prod' ? 'https://app.gratheon.com/account/reset-password' : 'http://localhost:8080/account/reset-password'),
  appShareTokenUrlPrefix: 'http://localhost:8080/',
};

export default config;

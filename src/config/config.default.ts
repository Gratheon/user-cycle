const config = {
  sentryDsn: "",
  schemaRegistryHost: `http://gql-schema-registry:3000`,
  selfUrl: "user-cycle:4000",
  grafanaUrl: "grafana:9000",
  grafanaUser: "admin",
  grafanaPassword: "admin",
  mysql: {
    host: 'mysql',
    port: '3306',
    user: 'test',
    password: 'test',
    database: 'user-cycle',
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
  clarifai: {
    translation_PAT: ''
  },

  google_oauth: {
    'client_id': '',
    'client_secret': '',
    'redirect_url': 'http://localhost:4000/auth/google/callback'
  },

  login_ui_url: 'http://localhost:8080/account/authenticate/',
  app_ui_url: 'http://localhost:8080/apiaries',
  appShareTokenUrlPrefix: 'http://localhost:8080/',
};

export default config;

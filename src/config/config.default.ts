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

	stripe: {
		price: '',
		selfUrl: '',
		appUrl: '',
		publicKey: '',
		secret: '',
		webhook_secret: '',
	},

	// this must match graphql-router
	JWT_KEY: 'okzfERFAXXbRTQWkGFfjo3EcAXjRijnGnaAMEsTXnmdjAVDkQrfyLzscPwUiymbj',
	
	// AWS SES configuration
	aws: {
		region: 'us-east-1', // Default region, can be overridden by environment
		accessKeyId: '',
		secretAccessKey: '',
		sesFromEmail: 'pilot@gratheon.com'
	},
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

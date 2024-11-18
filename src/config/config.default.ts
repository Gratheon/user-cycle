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
};

export default config;

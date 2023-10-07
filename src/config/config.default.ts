const config = {
	sentryDsn: "",
	schemaRegistryHost: ``,
	selfUrl: "",
	mysql: {
		host: '',
		port: '',
		user: '',
		password: '',
		database: '',
	},

	stripe: {
		price: '',
		selfUrl: '',
		publicKey: '',
		secret: '',
		webhook_secret: '',
	},

	JWT_KEY: '',
	SENDGRID_API_KEY: '',
	clarifai: {
		translation_PAT: ''
	}
};

export default config;

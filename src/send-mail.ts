//@ts-ignore
import * as fs from 'fs';
//@ts-ignore
import * as path from 'path';

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import config from './config/index';

//@ts-ignore
const welcomeEmailHtml = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.html'), 'utf8')

//@ts-ignore
const welcomeEmailTxt = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.txt'), 'utf8')

// Initialize SES client
const createSESClient = () => {
	return new SESClient({
		region: config.aws.region,
		credentials: {
			accessKeyId: config.aws.accessKeyId,
			secretAccessKey: config.aws.secretAccessKey,
		},
	});
};

export async function sendWelcomeMail({ email }) {
	const sesClient = createSESClient();

	const params = {
		Destination: {
			ToAddresses: [email],
		},
		Message: {
			Body: {
				Html: {
					Charset: 'UTF-8',
					Data: welcomeEmailHtml,
				},
				Text: {
					Charset: 'UTF-8',
					Data: welcomeEmailTxt,
				},
			},
			Subject: {
				Charset: 'UTF-8',
				Data: 'Welcome to Gratheon!',
			},
		},
		Source: config.aws.sesFromEmail,
	};

	const command = new SendEmailCommand(params);
	return sesClient.send(command);
}

export async function sendAdminUserRegisteredMail({ email }) {
	const sesClient = createSESClient();

	const params = {
		Destination: {
			ToAddresses: ['artkurapov@gmail.com'],
		},
		Message: {
			Body: {
				Text: {
					Charset: 'UTF-8',
					Data: `New user registered ${email}`,
				},
			},
			Subject: {
				Charset: 'UTF-8',
				Data: 'gratheon - new user',
			},
		},
		Source: config.aws.sesFromEmail,
	};

	const command = new SendEmailCommand(params);
	return sesClient.send(command);
}

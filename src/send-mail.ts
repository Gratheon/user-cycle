//@ts-ignore
import * as fs from 'fs';
//@ts-ignore
import * as path from 'path';

import sgMail from '@sendgrid/mail';
import config from './config/index';

//@ts-ignore
const welcomeEmailHtml = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.html'), 'utf8')

//@ts-ignore
const welcomeEmailTxt = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.txt'), 'utf8')

export async function sendWelcomeMail({ email }) {
	sgMail.setApiKey(config.SENDGRID_API_KEY)

	const msg = {
		to: email,
		from: 'pilot@gratheon.com',
		subject: 'Welcome to Gratheon!',

		text: welcomeEmailTxt,
		html: welcomeEmailHtml,
	}

	return sgMail.send(msg)
}

export async function sendAdminUserRegisteredMail({ email }) {
	sgMail.setApiKey(config.SENDGRID_API_KEY)

	const msg = {
		to: 'artkurapov@gmail.com',
		from: 'pilot@gratheon.com',
		subject: 'gratheon - new user',
		text: `New user registered ${email}`,
	}

	return sgMail.send(msg)
}

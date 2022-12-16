import sgMail from '@sendgrid/mail';
import config from '../config/config.js';

export function sendMail({ email }) {
	sgMail.setApiKey(config.SENDGRID_API_KEY)

	const msg = {
		to: email,
		from: 'pilot@gratheon.com',
		subject: 'Welcome to gratheon.com',
		text: '...',
		html: '...',
	}

	sgMail
		.send(msg)
		.then(() => {
			console.log('Email sent')
		})
		.catch((error) => {
			console.error(error)
		})
}

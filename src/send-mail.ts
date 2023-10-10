import sgMail from '@sendgrid/mail';
import config from './config/index';

export async function sendWelcomeMail({ email }) {
	sgMail.setApiKey(config.SENDGRID_API_KEY)

	const msg = {
		to: email,
		from: 'pilot@gratheon.com',
		subject: 'Welcome to gratheon.com!',

		text: `Hey! 
		Thanks for registering. 
		I am happy to have you join Gratheon to test out bee detection and monitoring that we have here.
		If you have any questions, feel free to reply. 
		
		Best regards,
		Artjom`,

		html: `Hey! <br />

		<p>
		Thanks for registering. 
		I am happy to have you join Gratheon to test out bee detection and monitoring that we have here.
		If you have any questions, feel free to reply. 
		</p>
		
		<p>
		Best regards,
		Artjom
		</p>`,
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

//@ts-ignore
import * as fs from 'fs';
//@ts-ignore
import * as path from 'path';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

import config from './config/index';
import { logger } from './logger';

// Initialize SES client
const sesClient = new SESClient({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

//@ts-ignore
const welcomeEmailHtml = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.html'), 'utf8')

//@ts-ignore
const welcomeEmailTxt = fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.txt'), 'utf8')

async function sendEmailWithSES({ 
    to, 
    subject, 
    textBody, 
    htmlBody 
}: {
    to: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
}) {
    const params = {
        Destination: {
            ToAddresses: [to],
        },
        Message: {
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: textBody,
                },
                ...(htmlBody && {
                    Html: {
                        Charset: 'UTF-8',
                        Data: htmlBody,
                    },
                }),
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject,
            },
        },
        Source: config.aws.sesFromEmail,
    };

    try {
        const command = new SendEmailCommand(params);
        const response = await sesClient.send(command);
        logger.info('Email sent successfully via SES', { 
            messageId: response.MessageId, 
            to, 
            subject 
        });
        return response;
    } catch (error) {
        logger.error('Failed to send email via SES', { error, to, subject });
        throw error;
    }
}

export async function sendWelcomeMail({ email }: { email: string }) {
    return await sendEmailWithSES({
        to: email,
        subject: 'Welcome to Gratheon!',
        textBody: welcomeEmailTxt,
        htmlBody: welcomeEmailHtml,
    });
}

export async function sendAdminUserRegisteredMail({ email }: { email: string }) {
    const adminEmail = 'pilot@gratheon.com';
    const subject = 'gratheon - new user';
    const textBody = `New user registered ${email}`;

    return await sendEmailWithSES({
        to: adminEmail,
        subject,
        textBody,
    });
}

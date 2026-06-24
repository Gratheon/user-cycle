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

//@ts-ignore
const passwordResetEmailHtml = fs.readFileSync(path.join(__dirname, '..', 'emails', 'password-reset.html'), 'utf8')

//@ts-ignore
const passwordResetEmailTxt = fs.readFileSync(path.join(__dirname, '..', 'emails', 'password-reset.txt'), 'utf8')

//@ts-ignore
const adminUserRegisteredEmailTxt = fs.readFileSync(path.join(__dirname, '..', 'emails', 'admin-user-registered.txt'), 'utf8')

type WelcomeEmailContent = {
    subject: string;
    greeting: string;
    intro: string;
    privateIssues: string;
    publicIssues: string;
    signoff: string;
    senderName?: string;
};

type PasswordResetEmailContent = {
    subject: string;
    intro: string;
    buttonLabel: string;
    expiryHint: string;
    ignoreHint: string;
    copyLinkHint: string;
    textOpenLink: string;
};

const welcomeEmailTranslations = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.json'), 'utf8')
) as Record<string, WelcomeEmailContent>;

const passwordResetEmailTranslations = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'emails', 'password-reset.json'), 'utf8')
) as Record<string, PasswordResetEmailContent>;

const welcomeEmailLangs = Object.keys(welcomeEmailTranslations);
const passwordResetEmailLangs = Object.keys(passwordResetEmailTranslations);

function normalizeEmailLang(lang: string | null | undefined, supportedLangs: string[]): string {
    if (!lang) return 'en';

    const normalized = String(lang).toLowerCase().trim().substring(0, 2);
    if (supportedLangs.includes(normalized)) {
        return normalized;
    }

    return 'en';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTemplate(
    template: string,
    variables: Record<string, string>,
    valueMapper: (value: string) => string = (value) => value
): string {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(variables, key)) {
            return valueMapper(variables[key]);
        }

        // Keep unknown placeholders visible so template mistakes are easy to notice.
        return match;
    });
}

function linkDiscordInHtml(text: string): string {
    const escapedText = escapeHtml(text);
    const discordLink = '<a href="https://discord.gg/PcbP4uedWj">Discord</a>';

    if (escapedText.includes('Discord')) {
        return escapedText.replace('Discord', discordLink);
    }

    return `${escapedText} ${discordLink}`;
}

function renderWelcomeEmailHtml(content: WelcomeEmailContent, lang: string): string {
    const direction = ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr';
    const senderName = content.senderName || 'Artjom Kurapov';

    // HTML values are escaped before rendering, except publicIssuesHtml which intentionally
    // contains the Discord anchor generated from escaped translation text.
    return renderTemplate(welcomeEmailHtml, {
        lang: escapeHtml(lang),
        direction,
        subject: escapeHtml(content.subject),
        greeting: escapeHtml(content.greeting),
        intro: escapeHtml(content.intro),
        privateIssues: escapeHtml(content.privateIssues),
        publicIssuesHtml: linkDiscordInHtml(content.publicIssues),
        authorImageFloat: direction === 'rtl' ? 'right' : 'left',
        signoff: escapeHtml(content.signoff),
        senderName: escapeHtml(senderName),
    });
}

function renderWelcomeEmailText(content: WelcomeEmailContent): string {
    return renderTemplate(welcomeEmailTxt, {
        greeting: content.greeting,
        intro: content.intro,
        privateIssues: content.privateIssues,
        publicIssues: content.publicIssues,
        signoff: content.signoff,
        senderName: content.senderName || 'Artjom Kurapov',
    });
}

function renderPasswordResetEmailHtml(content: PasswordResetEmailContent, lang: string, resetUrl: string): string {
    const direction = ['ar', 'he'].includes(lang) ? 'rtl' : 'ltr';

    // Password-reset HTML has no intentional markup in translations, so every value is escaped.
    return renderTemplate(passwordResetEmailHtml, {
        lang,
        direction,
        subject: content.subject,
        intro: content.intro,
        buttonLabel: content.buttonLabel,
        expiryHint: content.expiryHint,
        ignoreHint: content.ignoreHint,
        copyLinkHint: content.copyLinkHint,
        resetUrl,
    }, escapeHtml);
}

function renderPasswordResetEmailText(content: PasswordResetEmailContent, resetUrl: string): string {
    return renderTemplate(passwordResetEmailTxt, {
        intro: content.intro,
        textOpenLink: content.textOpenLink,
        resetUrl,
        ignoreHint: content.ignoreHint,
    });
}

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

export async function sendWelcomeMail({ email, lang }: { email: string; lang?: string | null }) {
    const emailLang = normalizeEmailLang(lang, welcomeEmailLangs);
    const content = welcomeEmailTranslations[emailLang] || welcomeEmailTranslations.en;

    return await sendEmailWithSES({
        to: email,
        subject: content.subject,
        textBody: renderWelcomeEmailText(content),
        htmlBody: renderWelcomeEmailHtml(content, emailLang),
    });
}

export async function sendAdminUserRegisteredMail({ email }: { email: string }) {
    const adminEmail = 'pilot@gratheon.com';
    const subject = 'gratheon - new user';
    const textBody = renderTemplate(adminUserRegisteredEmailTxt, { email });

    return await sendEmailWithSES({
        to: adminEmail,
        subject,
        textBody,
    });
}

export async function sendPasswordResetMail({ email, resetUrl, lang }: { email: string; resetUrl: string; lang?: string | null }) {
    const emailLang = normalizeEmailLang(lang, passwordResetEmailLangs);
    const content = passwordResetEmailTranslations[emailLang] || passwordResetEmailTranslations.en;

    return await sendEmailWithSES({
        to: email,
        subject: content.subject,
        textBody: renderPasswordResetEmailText(content, resetUrl),
        htmlBody: renderPasswordResetEmailHtml(content, emailLang, resetUrl),
    });
}

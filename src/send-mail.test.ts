const sendMock = jest.fn();
const SendEmailCommandMock = jest.fn().mockImplementation((input) => ({ input }));

jest.mock('@aws-sdk/client-ses', () => ({
    SESClient: jest.fn().mockImplementation(() => ({
        send: sendMock,
    })),
    SendEmailCommand: SendEmailCommandMock,
}));

jest.mock('./config/index', () => ({
    __esModule: true,
    default: {
        aws: {
            region: 'eu-test-1',
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
            sesFromEmail: 'hello@gratheon.com',
        },
    },
}));

jest.mock('./logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
    },
}));

import * as fs from 'fs';
import * as path from 'path';
import { sendPasswordResetMail, sendWelcomeMail } from './send-mail';

const welcomeTranslations = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'emails', 'welcome.json'), 'utf8')
) as Record<string, { subject: string }>;

const passwordResetTranslations = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'emails', 'password-reset.json'), 'utf8')
) as Record<string, { subject: string }>;

function latestSesInput() {
    const calls = SendEmailCommandMock.mock.calls;
    return calls[calls.length - 1]?.[0];
}

describe('sendWelcomeMail', () => {
    beforeEach(() => {
        sendMock.mockResolvedValue({ MessageId: 'message-id' });
        SendEmailCommandMock.mockClear();
    });

    it('renders localized welcome email from file templates', async () => {
        await sendWelcomeMail({ email: 'new-user@example.com', lang: 'ru-RU' });

        const input = latestSesInput();
        expect(input.Destination.ToAddresses).toEqual(['new-user@example.com']);
        expect(input.Source).toBe('hello@gratheon.com');
        expect(input.Message.Subject.Data).toBe('Добро пожаловать в Gratheon!');

        const textBody = input.Message.Body.Text.Data;
        expect(textBody).toContain('Здравствуйте!');
        expect(textBody).toContain('https://discord.gg/PcbP4uedWj');
        expect(textBody).toContain('Артём Курапов');
        expect(textBody).not.toMatch(/{{\s*\w+\s*}}/);

        const htmlBody = input.Message.Body.Html.Data;
        expect(htmlBody).toContain('<html lang="ru" dir="ltr">');
        expect(htmlBody).toContain('Здравствуйте!');
        expect(htmlBody).toContain('<a href="https://discord.gg/PcbP4uedWj">Discord</a>');
        expect(htmlBody).toContain('Артём Курапов');
        expect(htmlBody).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('falls back to English and escapes HTML-sensitive translated values', async () => {
        await sendWelcomeMail({ email: 'fallback@example.com', lang: '<script>' });

        const input = latestSesInput();
        expect(input.Message.Subject.Data).toBe('Welcome to Gratheon!');

        const textBody = input.Message.Body.Text.Data;
        expect(textBody).toContain('Hey!');
        expect(textBody).toContain('Bee Well,');
        expect(textBody).not.toMatch(/{{\s*\w+\s*}}/);

        const htmlBody = input.Message.Body.Html.Data;
        expect(htmlBody).toContain('<html lang="en" dir="ltr">');
        expect(htmlBody).toContain('Welcome to Gratheon!');
        expect(htmlBody).toContain('<a href="https://discord.gg/PcbP4uedWj">Discord</a> server');
        expect(htmlBody).not.toContain('<script>');
        expect(htmlBody).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('renders right-to-left markup for Arabic', async () => {
        await sendWelcomeMail({ email: 'arabic@example.com', lang: 'ar' });

        const input = latestSesInput();
        const htmlBody = input.Message.Body.Html.Data;
        expect(input.Message.Subject.Data).toBe('مرحبًا بك في Gratheon!');
        expect(htmlBody).toContain('<html lang="ar" dir="rtl">');
        expect(htmlBody).toContain('float:right;');
        expect(htmlBody).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('renders every configured welcome language without unresolved placeholders', async () => {
        for (const [lang, translation] of Object.entries(welcomeTranslations)) {
            await sendWelcomeMail({ email: `${lang}@example.com`, lang });

            const input = latestSesInput();
            expect(input.Message.Subject.Data).toBe(translation.subject);
            expect(input.Message.Body.Text.Data).not.toMatch(/{{\s*\w+\s*}}|undefined/);
            expect(input.Message.Body.Html.Data).not.toMatch(/{{\s*\w+\s*}}|undefined/);
        }
    });
});

describe('sendPasswordResetMail', () => {
    beforeEach(() => {
        sendMock.mockResolvedValue({ MessageId: 'message-id' });
        SendEmailCommandMock.mockClear();
    });

    it('renders localized password reset email from file templates', async () => {
        await sendPasswordResetMail({
            email: 'reset-user@example.com',
            resetUrl: 'https://app.gratheon.com/reset?token=abc123',
            lang: 'ru-RU',
        });

        const input = latestSesInput();
        expect(input.Destination.ToAddresses).toEqual(['reset-user@example.com']);
        expect(input.Source).toBe('hello@gratheon.com');
        expect(input.Message.Subject.Data).toBe('Сброс пароля Gratheon');

        const textBody = input.Message.Body.Text.Data;
        expect(textBody).toContain('Мы получили запрос на сброс вашего пароля Gratheon.');
        expect(textBody).toContain('Откройте эту ссылку в течение 1 часа');
        expect(textBody).toContain('https://app.gratheon.com/reset?token=abc123');
        expect(textBody).not.toMatch(/{{\s*\w+\s*}}/);

        const htmlBody = input.Message.Body.Html.Data;
        expect(htmlBody).toContain('<html lang="ru" dir="ltr">');
        expect(htmlBody).toContain('Сбросить пароль');
        expect(htmlBody).toContain('href="https://app.gratheon.com/reset?token=abc123"');
        expect(htmlBody).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('falls back to English for unsupported password reset languages', async () => {
        await sendPasswordResetMail({
            email: 'fallback-reset@example.com',
            resetUrl: 'https://app.gratheon.com/reset?token=fallback',
            lang: 'xx',
        });

        const input = latestSesInput();
        expect(input.Message.Subject.Data).toBe('Reset your Gratheon password');
        expect(input.Message.Body.Text.Data).toContain('We received a request to reset your Gratheon password.');
        expect(input.Message.Body.Html.Data).toContain('<html lang="en" dir="ltr">');
        expect(input.Message.Body.Html.Data).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('renders right-to-left password reset markup for Arabic', async () => {
        await sendPasswordResetMail({
            email: 'arabic-reset@example.com',
            resetUrl: 'https://app.gratheon.com/reset?token=arabic',
            lang: 'ar',
        });

        const input = latestSesInput();
        expect(input.Message.Subject.Data).toBe('إعادة تعيين كلمة مرور Gratheon');
        expect(input.Message.Body.Html.Data).toContain('<html lang="ar" dir="rtl">');
        expect(input.Message.Body.Html.Data).not.toMatch(/{{\s*\w+\s*}}/);
    });

    it('renders every configured password reset language without unresolved placeholders', async () => {
        for (const [lang, translation] of Object.entries(passwordResetTranslations)) {
            await sendPasswordResetMail({
                email: `${lang}-reset@example.com`,
                resetUrl: `https://app.gratheon.com/reset?token=${lang}`,
                lang,
            });

            const input = latestSesInput();
            expect(input.Message.Subject.Data).toBe(translation.subject);
            expect(input.Message.Body.Text.Data).not.toMatch(/{{\s*\w+\s*}}|undefined/);
            expect(input.Message.Body.Html.Data).not.toMatch(/{{\s*\w+\s*}}|undefined/);
        }
    });
});

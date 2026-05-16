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

type WelcomeEmailContent = {
    subject: string;
    greeting: string;
    intro: string;
    privateIssues: string;
    publicIssues: string;
    signoff: string;
    senderName?: string;
};

const supportedWelcomeEmailLangs = [
    'en', 'ru', 'et', 'tr', 'pl', 'de', 'fr', 'zh', 'hi', 'es', 'ar', 'bn', 'pt', 'ja'
];

const welcomeEmailTranslations: Record<string, WelcomeEmailContent> = {
    en: {
        subject: 'Welcome to Gratheon!',
        greeting: 'Hey!',
        intro: 'I am glad you joined and I hope this web-app helps to observe and understand bees in your apiary.',
        privateIssues: 'If you have any private issues like billing, feel free to email me.',
        publicIssues: 'For public issues, feedback, feature requests or questions I encourage you to join our community in the Discord server.',
        signoff: 'Bee Well,'
    },
    ru: {
        subject: 'Добро пожаловать в Gratheon!',
        greeting: 'Здравствуйте!',
        intro: 'Рад, что вы присоединились. Надеюсь, это веб-приложение поможет наблюдать за пчёлами на вашей пасеке и лучше понимать их состояние.',
        privateIssues: 'Если у вас есть личные вопросы, например по оплате, напишите мне по email.',
        publicIssues: 'По публичным проблемам, отзывам, предложениям функций или вопросам приглашаю вас присоединиться к нашему сообществу в Discord.',
        signoff: 'Пчелиного благополучия,',
        senderName: 'Артём Курапов',
    },
    et: {
        subject: 'Tere tulemast Gratheoni!',
        greeting: 'Tere!',
        intro: 'Mul on hea meel, et liitusid. Loodan, et see veebirakendus aitab sul mesilas mesilasi jälgida ja paremini mõista.',
        privateIssues: 'Kui sul on isiklikke küsimusi, näiteks arvelduse kohta, kirjuta mulle julgelt e-postiga.',
        publicIssues: 'Avalike probleemide, tagasiside, funktsioonisoovide või küsimuste jaoks kutsun sind liituma meie kogukonnaga Discordi serveris.',
        signoff: 'Mesilastele head,',
    },
    tr: {
        subject: 'Gratheon’a hoş geldiniz!',
        greeting: 'Merhaba!',
        intro: 'Katıldığınız için mutluyum. Umarım bu web uygulaması arılığınızdaki arıları gözlemlemenize ve anlamanıza yardımcı olur.',
        privateIssues: 'Faturalandırma gibi özel konularda bana e-posta göndermekten çekinmeyin.',
        publicIssues: 'Genel sorunlar, geri bildirimler, özellik istekleri veya sorular için Discord sunucumuzdaki topluluğumuza katılmanızı öneririm.',
        signoff: 'Arılarla kalın,',
    },
    pl: {
        subject: 'Witamy w Gratheon!',
        greeting: 'Cześć!',
        intro: 'Cieszę się, że dołączyłeś. Mam nadzieję, że ta aplikacja internetowa pomoże obserwować i lepiej rozumieć pszczoły w Twojej pasiece.',
        privateIssues: 'Jeśli masz prywatne sprawy, na przykład dotyczące płatności, napisz do mnie e-mailem.',
        publicIssues: 'W przypadku publicznych problemów, opinii, próśb o funkcje lub pytań zachęcam do dołączenia do naszej społeczności na serwerze Discord.',
        signoff: 'Pszczelego dobra,',
    },
    de: {
        subject: 'Willkommen bei Gratheon!',
        greeting: 'Hallo!',
        intro: 'Ich freue mich, dass du dabei bist. Ich hoffe, diese Web-App hilft dir, die Bienen in deiner Imkerei zu beobachten und besser zu verstehen.',
        privateIssues: 'Wenn du private Anliegen wie Abrechnung hast, schreib mir gern eine E-Mail.',
        publicIssues: 'Für öffentliche Probleme, Feedback, Funktionswünsche oder Fragen lade ich dich ein, unserer Community auf dem Discord-Server beizutreten.',
        signoff: 'Bee Well,',
    },
    fr: {
        subject: 'Bienvenue sur Gratheon !',
        greeting: 'Bonjour !',
        intro: 'Je suis heureux que vous nous ayez rejoints. J’espère que cette application web vous aidera à observer et à mieux comprendre les abeilles de votre rucher.',
        privateIssues: 'Si vous avez des questions privées, par exemple sur la facturation, n’hésitez pas à m’écrire par e-mail.',
        publicIssues: 'Pour les problèmes publics, les retours, les demandes de fonctionnalités ou les questions, je vous encourage à rejoindre notre communauté sur le serveur Discord.',
        signoff: 'Bee Well,',
    },
    zh: {
        subject: '欢迎使用 Gratheon！',
        greeting: '你好！',
        intro: '很高兴你加入我们。希望这个 Web 应用能帮助你观察并了解蜂场中的蜜蜂。',
        privateIssues: '如果你有账单等私人问题，欢迎给我发邮件。',
        publicIssues: '对于公开问题、反馈、功能请求或疑问，欢迎加入我们的 Discord 服务器社区。',
        signoff: '祝蜜蜂安好，',
    },
    hi: {
        subject: 'Gratheon में आपका स्वागत है!',
        greeting: 'नमस्ते!',
        intro: 'मुझे खुशी है कि आप जुड़े। उम्मीद है कि यह वेब ऐप आपकी मधुमक्खीशाला में मधुमक्खियों को देखने और समझने में मदद करेगा।',
        privateIssues: 'बिलिंग जैसे निजी मामलों के लिए आप मुझे ईमेल कर सकते हैं।',
        publicIssues: 'सार्वजनिक समस्याओं, प्रतिक्रिया, फीचर अनुरोधों या सवालों के लिए मैं आपको हमारे Discord सर्वर समुदाय से जुड़ने के लिए आमंत्रित करता हूँ।',
        signoff: 'मधुमक्खियों का कल्याण हो,',
    },
    es: {
        subject: '¡Bienvenido a Gratheon!',
        greeting: '¡Hola!',
        intro: 'Me alegra que te hayas unido. Espero que esta aplicación web te ayude a observar y entender las abejas de tu apiario.',
        privateIssues: 'Si tienes asuntos privados, como facturación, puedes escribirme por correo electrónico.',
        publicIssues: 'Para problemas públicos, comentarios, solicitudes de funciones o preguntas, te animo a unirte a nuestra comunidad en el servidor de Discord.',
        signoff: 'Bee Well,',
    },
    ar: {
        subject: 'مرحبًا بك في Gratheon!',
        greeting: 'مرحبًا!',
        intro: 'يسعدني انضمامك. آمل أن يساعدك هذا التطبيق على مراقبة النحل في منحلك وفهمه بشكل أفضل.',
        privateIssues: 'إذا كانت لديك مسائل خاصة مثل الفوترة، فلا تتردد في مراسلتي عبر البريد الإلكتروني.',
        publicIssues: 'للمشكلات العامة أو الملاحظات أو طلبات الميزات أو الأسئلة، أدعوك للانضمام إلى مجتمعنا على خادم Discord.',
        signoff: 'مع أطيب التمنيات للنحل،',
    },
    bn: {
        subject: 'Gratheon-এ স্বাগতম!',
        greeting: 'হ্যালো!',
        intro: 'আপনি যোগ দিয়েছেন বলে আমি আনন্দিত। আশা করি এই ওয়েব অ্যাপটি আপনার মৌচাকে মৌমাছি পর্যবেক্ষণ ও বোঝার কাজে সাহায্য করবে।',
        privateIssues: 'বিলিংয়ের মতো ব্যক্তিগত বিষয়ে আমাকে ইমেইল করতে পারেন।',
        publicIssues: 'সাধারণ সমস্যা, মতামত, নতুন ফিচারের অনুরোধ বা প্রশ্নের জন্য আমাদের Discord সার্ভারের কমিউনিটিতে যোগ দিতে আপনাকে আমন্ত্রণ জানাই।',
        signoff: 'মৌমাছির মঙ্গল কামনায়,',
    },
    pt: {
        subject: 'Bem-vindo ao Gratheon!',
        greeting: 'Olá!',
        intro: 'Fico feliz por você ter se juntado a nós. Espero que este aplicativo web ajude a observar e entender as abelhas no seu apiário.',
        privateIssues: 'Se você tiver assuntos privados, como faturamento, fique à vontade para me enviar um e-mail.',
        publicIssues: 'Para problemas públicos, feedback, pedidos de recursos ou perguntas, incentivo você a entrar na nossa comunidade no servidor Discord.',
        signoff: 'Bee Well,',
    },
    ja: {
        subject: 'Gratheon へようこそ！',
        greeting: 'こんにちは！',
        intro: 'ご参加いただきありがとうございます。この Web アプリが、養蜂場のミツバチを観察し理解する助けになればうれしいです。',
        privateIssues: '請求などの個別の問題があれば、遠慮なくメールでご連絡ください。',
        publicIssues: '公開の問題、フィードバック、機能リクエスト、質問については、Discord サーバーのコミュニティにご参加ください。',
        signoff: 'Bee Well,',
    },
};

function normalizeEmailLang(lang?: string | null): string {
    if (!lang) return 'en';

    const normalized = String(lang).toLowerCase().trim().substring(0, 2);
    if (supportedWelcomeEmailLangs.includes(normalized)) {
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

function linkDiscordInHtml(text: string): string {
    const escapedText = escapeHtml(text);
    const discordLink = '<a href="https://discord.gg/PcbP4uedWj">Discord</a>';

    if (escapedText.includes('Discord')) {
        return escapedText.replace('Discord', discordLink);
    }

    return `${escapedText} ${discordLink}`;
}

function renderWelcomeEmailHtml(content: WelcomeEmailContent, lang: string): string {
    if (lang === 'en') {
        return welcomeEmailHtml;
    }

    const direction = lang === 'ar' ? 'rtl' : 'ltr';

    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${direction}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(content.subject)}</title>
    <style>
        h1, h2, h3, h4, h5, h6 { font-family: Georgia, 'Times New Roman', serif; }
        body { font-family: Arial, sans-serif; font-size: 16px; color: black; line-height: 1.6; padding: 20px; }
        a, a:visited { color: #0248FF; }
        a:hover { color: #2F8B0B; }
        .container { max-width: 600px; margin: 0 auto; background-color: #fff; padding: 20px 25px; border-radius: 8px; border-left: solid 2px #FFD900; border-right: solid 2px #FFD900; border-bottom: 2px solid #2F8B0B; border-top: 2px solid #0248FF; }
        p { font-size: 16px; line-height: 140%; }
        .logo { display: block; margin: 0 auto 20px; max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <div class="container">
        <img width="50" height="50" src="https://gratheon.com/img/logo_v7.png" alt="Gratheon Logo" class="logo">
        <p>${escapeHtml(content.greeting)}</p>
        <p>${escapeHtml(content.intro)}</p>
        <p>${escapeHtml(content.privateIssues)} ${linkDiscordInHtml(content.publicIssues)}</p>
        <img width="50" height="50" style="float:${direction === 'rtl' ? 'right' : 'left'}; border-radius: 25px; margin: 0 10px 0 0;" src="https://user-cycle.gratheon.com/assets/logo-100.jpg" />
        <p>${escapeHtml(content.signoff)}<br>${escapeHtml(content.senderName || 'Artjom Kurapov')}</p>
    </div>
</body>
</html>`;
}

function renderWelcomeEmailText(content: WelcomeEmailContent, lang: string): string {
    if (lang === 'en') {
        return welcomeEmailTxt;
    }

    return `${content.greeting}

${content.intro}

${content.privateIssues}
${content.publicIssues} - https://discord.gg/PcbP4uedWj

${content.signoff}
${content.senderName || 'Artjom Kurapov'}`;
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
    const emailLang = normalizeEmailLang(lang);
    const content = welcomeEmailTranslations[emailLang] || welcomeEmailTranslations.en;

    return await sendEmailWithSES({
        to: email,
        subject: content.subject,
        textBody: renderWelcomeEmailText(content, emailLang),
        htmlBody: renderWelcomeEmailHtml(content, emailLang),
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

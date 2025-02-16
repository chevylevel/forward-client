import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { AuthService } from "./client/AuthService";
import { BotActions, BotCommands, ForwardOrigin, InputMode } from "./types";
import { GCDataStorage } from "./GCDataStorage";
import { SERVICE_PHONE } from ".";
import { ServiceClient } from "./client/ServiceClient";
import { Message, Update } from "telegraf/types";
import { UserClient } from "./client/UserClient";
import { session } from 'telegraf/session';

interface SessionData {
    inputMode: InputMode;
    phone?: string;
    phoneCodeHash?: string;
    replyTo?: { [messageId: number]: number; };
}

interface MyContext extends Context<Update> {
    session: SessionData;
    update: Update & { message?: Message.TextMessage };
}

export class Bot {
    bot: Telegraf<MyContext>;
    storage: GCDataStorage;
    authService: AuthService;
    userClient?: UserClient;

    constructor(
        storage: GCDataStorage,
        authService: AuthService,
    ) {
        this.bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!);
        this.storage = storage;
        this.authService = authService;
    }

    init() {
        this.bot.use(session({
            defaultSession: () => ({
                inputMode: InputMode.IDLE,
                phone: undefined,
                replyTo: undefined,
            }),
        }));

        this.bot.start(this.start.bind(this));
        this.bot.command(BotCommands.LOGIN, this.login.bind(this));
        this.bot.command(BotCommands.TEMPLATE, this.template.bind(this));

        this.bot.action(BotActions.SET_TEMPLATE, this.setTemplate.bind(this));
        this.bot.action(BotActions.VIEW_TEMPLATE, this.viewTemplate.bind(this));
        this.bot.action(BotActions.ACCEPT, this.accept.bind(this));
        this.bot.action(BotActions.DECLINE, this.decline.bind(this));

        this.bot.on(message('text'), (ctx) => { this.hearText(ctx as MyContext) });

        this.bot.launch(() => console.log('bot launched'));
    };

    async hearText(ctx: MyContext) {
        if (!(ctx?.message && 'text' in ctx?.message)) return;

        if (ctx.session.inputMode === InputMode.WAITING_PHONE) {
            await this.inputPhone(ctx);

            ctx.session.phone = ctx?.message?.text;
            ctx.session.inputMode = InputMode.WAITING_CODE;

            return;
        }

        if (ctx.session.inputMode === InputMode.WAITING_CODE) {
            await this.inputCode(ctx);

            return;
        }

        if (ctx.session.inputMode === InputMode.WAITING_TEMPLATE) {
            await this.saveTemplate(ctx);

            return;
        }

        this.replyWithMarkup(ctx);
    }


    async start(ctx: MyContext) {
        const userId = ctx?.from?.id.toString();
        if (!userId) return;

        const me = await this.authService.getMe(userId);

        if (!me) {
            ctx.reply('Welcome to surfstudent_bot, start with /login');

            return;
        }

        if (me.phone !== SERVICE_PHONE) await this.viewTemplate(ctx);
    }

    async login(ctx: MyContext) {
        const userId = ctx?.from?.id?.toString();
        if (!userId) return;

        if (await this.authService.getMe(userId)) {
            ctx.reply("You already logged in ");

            return;
        }

        ctx.reply("📲 Send your phone number (with country code, e.g., +7XXXXXXXX)");
        ctx.session.inputMode = InputMode.WAITING_PHONE;
    }

    async inputPhone(ctx: MyContext) {
        const userId = ctx?.from?.id.toString();
        if (!userId || !(ctx?.message && 'text' in ctx?.message)) return;

        const isValidPhone = new RegExp('^\\+(\\d+){11}$').test(ctx.message.text);

        if (!isValidPhone) {
            ctx.reply("❌ Invalid phone format. Try again");

            return;
        }

        const phoneCodeHash = await this.authService?.requestCode(userId, {
            phoneNumber: ctx.message.text,
            onError: () => ctx.reply("Code request server error. Try again later"),
        });

        if (!phoneCodeHash) return;

        ctx.session.phoneCodeHash = phoneCodeHash;
        ctx.reply("🔢 Send code in format: X X X X X: add spaces between symbols");
    }

    async inputCode(ctx: MyContext) {
        const userId = ctx.from!.id.toString();
        const phone = ctx.session.phone;
        const phoneCodeHash = ctx.session.phoneCodeHash;
        const message = ctx.message;
        if (!phone || !userId || !(message && 'text' in message) || !phoneCodeHash) return;

        const isValidPhoneCode = new RegExp('^\\da\\da\\da\\da\\d$').test(message.text);

        if (!isValidPhoneCode) {
            ctx.reply("❌ Invalid code format. Try again");

            return;
        }

        const phoneCode = message.text.split(' ').join('');

        try {
            await this.authService.signIn(
                userId,
                {
                    phoneNumber: phone,
                    phoneCode,
                    phoneCodeHash,
                    onError: () => ctx.reply('❌ Login failed. Try again.'),
                }
            );

            await this.onLoginSuccess(ctx);
        } catch (error) {
            console.log(`SignIn error: ${error}`);
        }
    }

    async onLoginSuccess(ctx: MyContext) {
        const userId = ctx?.from?.id.toString();
        if (!userId) return;

        ctx.session.inputMode = InputMode.IDLE;
        ctx.reply("🎉 Successfully logged in!");

        const me = await this.authService.getMe(userId);
        const client = await this.authService.getClient(userId);

        if (me?.phone === SERVICE_PHONE) {
            const serviceClient = new ServiceClient(client);
            serviceClient.init();

            console.log('Listening for new messages...');

            return;
        };

        this.userClient = new UserClient(client);
        await this.viewTemplate(ctx);
    }

    replyWithMarkup(ctx: MyContext) {
        const message = ctx?.message;
        const userId = ctx?.from?.id;

        if (!userId || !(message && 'text' in message)) return;

        console.log(message);

        if (
            !message || !userId
            || message?.from.id === this.bot.botInfo?.id
            || Object.values(BotCommands).includes(message.text.slice(1) as BotCommands)
            || !message.forward_origin
        ) return;

        const { forward_origin: {
            sender_user: {
                id: forwardOrigin
            }
        } } = message as ForwardOrigin

        ctx.reply(message.text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👍', callback_data: BotActions.ACCEPT },
                        { text: '👎', callback_data: BotActions.DECLINE },
                    ],
                ],
            }
        }).then(sentMessage => {
            ctx.session.replyTo = { [sentMessage.message_id]: forwardOrigin }
            console.log('messageId save:', sentMessage.message_id, message?.forward_origin);
        })

        ctx.deleteMessage();
    }

    async accept(ctx: MyContext) {
        await ctx.answerCbQuery();
        const message = ctx.callbackQuery?.message;
        const userId = ctx.from?.id.toString();

        if (!userId) return;

        const replyTo = ctx.session.replyTo

        if (message?.message_id && replyTo && replyTo[message?.message_id]) {
            const template = await this.storage.getPreference(userId, 'template')

            if (!template) {
                ctx.reply('There is no template. Set template /template and accept again');

                return;
            }

            this.userClient?.sendTemplate(replyTo[message.message_id], template)
        }

        ctx.deleteMessage();
    };

    async decline(ctx: MyContext) {
        await ctx.answerCbQuery();
        ctx.deleteMessage();
    };

    async template(ctx: MyContext) {
        const userId = ctx?.from?.id;
        if (!userId) return;

        ctx.reply('Hi! Choose action:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Set template", callback_data: BotActions.SET_TEMPLATE }],
                    [{ text: "View template", callback_data: BotActions.VIEW_TEMPLATE }],
                ],
            },
        });
    }

    async setTemplate(ctx: MyContext) {
        const userId = ctx?.from?.id;
        if (!userId) return;

        ctx.session.inputMode = InputMode.WAITING_TEMPLATE,

            ctx.reply('Send your template');
    }

    async saveTemplate(ctx: MyContext) {
        const userId = ctx?.from?.id?.toString()
        const message = ctx?.message;
        if (!userId || !(message && 'text' in message)) return;

        await this.storage.savePreference(userId, { template: message.text });

        ctx.reply('Template successfully saved!');
    }

    async viewTemplate(ctx: MyContext) {
        const userId = ctx?.from?.id?.toString();
        if (!userId) return;

        const welcomeMessage = await this.storage.getPreference(userId, 'template');

        if (welcomeMessage) {
            ctx.reply(`Your template:\n ${welcomeMessage}`);
        } else {
            ctx.reply(`Template doesn't set`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Set template", callback_data: BotActions.SET_TEMPLATE }],
                    ],
                },
            });
        }
    }
}

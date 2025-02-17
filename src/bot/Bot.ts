import { Context, Telegraf } from "telegraf";
import { session } from 'telegraf/session';
import { Message, Update } from "telegraf/types";
import { message } from "telegraf/filters";

import { AuthService } from "../client/AuthService";
import { BotActions, BotCommands, ForwardOrigin, InputMode } from "../types";
import { GCDataStorage } from "../GCDataStorage";
import { SERVICE_PHONE } from "../";
import { BotAuthHandler } from "./BotAuthHandler";
import { ClientManager } from "../client/ClientManager";

interface SessionData {
    inputMode: InputMode;
    phone?: string;
    phoneCodeHash?: string;
    isService?: boolean;
    replyTo?: { [messageId: number]: number; };
    isAuthenticated?: boolean;
}

export interface MyContext extends Context<Update> {
    session: SessionData;
    update: Update & { message?: Message.TextMessage };
}

export class Bot {
    bot: Telegraf<MyContext>;
    storage: GCDataStorage;
    authService: AuthService;
    botAuthHandler: BotAuthHandler;
    clientManager: ClientManager;

    constructor(
        storage: GCDataStorage,
        authService: AuthService,
    ) {
        this.bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!);
        this.storage = storage;
        this.authService = authService;
        this.botAuthHandler = new BotAuthHandler(this.authService);
        this.clientManager = new ClientManager();
    }

    async init() {
        for (const [userId] of this.authService.clients) {
            try {
                await this.bot.telegram.sendMessage(
                    userId,
                    '⚠️ The bot was disconnected. Run /start to connect'
                );
            } catch (error) {
                console.error(`Failed to notify user ${userId} of restart`, error);
            }
        }

        this.bot.use(session({
            defaultSession: () => ({
                inputMode: InputMode.IDLE,
            }),
        }));

        this.bot.use(async (ctx, next) => { // when ctx.session erased on bot restart
            const userId = ctx?.from?.id?.toString();
            if (!userId) return;

            const client = await this.authService.getClient(userId);

            if (ctx.session.isAuthenticated !== undefined) return;

            ctx.session.isAuthenticated = await this.authService.isAuth(userId);

            if (ctx.session.isAuthenticated) {
                const me = await this.authService.getMe(userId);
                ctx.session.isService = me?.phone === SERVICE_PHONE;


                this.clientManager.init({
                    client,
                    isService: ctx.session.isService,
                    onInit: (message) => { ctx.reply(`${message}`) },
                });
            }

            await next();
        })

        this.bot.start(this.start.bind(this));
        this.bot.command(BotCommands.LOGIN, this.botAuthHandler.login.bind(this.botAuthHandler));
        this.bot.command(BotCommands.TEMPLATE, this.template.bind(this));

        this.bot.action(BotActions.SET_TEMPLATE, this.setTemplate.bind(this));
        this.bot.action(BotActions.VIEW_TEMPLATE, this.viewTemplate.bind(this));
        this.bot.action(BotActions.ACCEPT, this.accept.bind(this));
        this.bot.action(BotActions.DECLINE, this.decline.bind(this));
        this.bot.action(BotActions.CANCEL, this.cancel.bind(this));

        this.bot.on(message('text'), (ctx) => {
            !ctx.session.isAuthenticated || ctx.session.isService
                ? this.hearAuthInput(ctx)
                : this.hearMessages(ctx)
        });

        this.bot.launch(() => console.log('bot launched'));
    };

    async hearAuthInput(ctx: MyContext) {
        if (!(ctx?.message && 'text' in ctx?.message)) return;

        if (ctx.session.inputMode === InputMode.WAITING_PHONE) {
            await this.botAuthHandler.inputPhone(ctx);

            ctx.session.phone = ctx.message.text;
            ctx.session.inputMode = InputMode.WAITING_CODE;

            return;
        }

        if (ctx.session.inputMode === InputMode.WAITING_CODE) {
            await this.botAuthHandler.inputCode(ctx);
            await this.onLoginSuccess(ctx)

            return;
        }
    }

    async onLoginSuccess(ctx: MyContext) {
        const userId = ctx?.from?.id.toString();
        if (!userId) return;

        ctx.session.inputMode = InputMode.IDLE;
        ctx.reply("🎉 Successfully logged in!");

        const me = await this.authService.getMe(userId);
        const client = await this.authService.getClient(userId);

        console.log('me.phone', me?.phone);

        ctx.session.isAuthenticated = true;
        ctx.session.isService = me?.phone === SERVICE_PHONE;

        this.clientManager.init({
            client,
            isService: ctx.session.isService,
            onInit: (message) => { ctx.reply(`${message}`) }
        });

        await this.viewTemplate(ctx);
    }

    async hearMessages(ctx: MyContext) {
        if (ctx.session.inputMode === InputMode.WAITING_TEMPLATE) {
            await this.saveTemplate(ctx);

            return;
        }

        if (ctx.session.inputMode === InputMode.IDLE) {
            this.replyWithMarkup(ctx);

            return;
        }
    }

    async start(ctx: MyContext) {
        if (ctx.session.isAuthenticated) return;

        ctx.reply('Welcome to surfstudent_bot, start with /login');
    }

    replyWithMarkup(ctx: MyContext) {
        console.log('reply w mu');
        const message = ctx?.message;
        const userId = ctx?.from?.id;

        if (!userId || !(message && 'text' in message)) return;

        if (
            !message || !userId
            || message?.from.id === this.bot.botInfo?.id
            || Object.values(BotCommands).includes(message.text.slice(1) as BotCommands)
        ) return;

        const forwardOrigin = (message as ForwardOrigin)?.forward_origin?.sender_user?.id;
        if (!forwardOrigin) return;

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

        setTimeout(() => ctx.deleteMessage(), 1000);
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

            const userClient = this.clientManager.getUserClient();

            if (!userClient) {
                console.error(`User client not found for userId: ${userId}`);
                ctx.reply('⚠️ Something went wrong, please try again later.');

                return;
            }

            await userClient.sendTemplate(replyTo[message.message_id], template);
        }

        setTimeout(() => ctx.deleteMessage(), 1000);
    };

    async decline(ctx: MyContext) {
        await ctx.answerCbQuery();
        ctx.deleteMessage();
    };

    async cancel(ctx: MyContext) {
        await ctx.answerCbQuery();
        ctx.session.inputMode = InputMode.IDLE;
        ctx.reply(`Action been cancelled`);
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

        ctx.session.inputMode = InputMode.WAITING_TEMPLATE;
        ctx.reply('Send your template', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Cancel", callback_data: BotActions.CANCEL }],
                ],
            },
        });
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

        console.log('viewTemplate');
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

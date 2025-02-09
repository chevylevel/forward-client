import { Context, Telegraf } from "telegraf";
import { GCDataStorage } from "./GCDataStorage";
import { message } from "telegraf/filters";
import { ClienService } from "./ClientService";

enum InputMode {
    IDLE = 'idle',
    WAITING_PHONE = 'waiting_phone',
    WAITING_CODE = 'waiting_code',
    WAITING_TEMPLATE = 'waiting_template',
}

enum BotActions {
    SET_TEMPLATE = 'set_template',
    VIEW_TEMPLATE = 'view_template',
    ACCEPT = 'accept',
    DECLINE = 'decline',
}

enum BotCommands {
    START = 'start',
    LOGIN = 'login',
    TEMPLATE = 'template',
}

interface UserState {
    inputMode?: InputMode
    phone?: string;
    replyTo?: { [key: number]: number }
}

type Sender = {
    forward_origin: {
        sender_user: {
            id: number
        }
    }
};

const userState = new Map<number, UserState>();

export class BotService {
    bot: Telegraf;
    storage: GCDataStorage;
    clientService!: ClienService;

    constructor(storage: GCDataStorage, clientService: ClienService) {
        this.storage = storage;
        this.clientService = clientService
        this.bot = new Telegraf(process.env.BOT_TOKEN!);
    }

    async init() {
        this.bot.start(this.start.bind(this));
        this.bot.command(BotCommands.LOGIN, this.login.bind(this));
        this.bot.command(BotCommands.TEMPLATE, this.template.bind(this));
        this.bot.action(BotActions.SET_TEMPLATE, this.setTemplate.bind(this));
        this.bot.action(BotActions.VIEW_TEMPLATE, this.viewTemplate.bind(this));
        this.bot.action(BotActions.ACCEPT, this.accept.bind(this));
        this.bot.action(BotActions.DECLINE, this.decline.bind(this));
        this.bot.on(message('text'), this.hearText.bind(this));
        this.bot.launch(() => console.log('bot launched'));

        console.log('Listening for new messages...');
    };

    async start(ctx: Context) {
        const userId = ctx.from?.id;

        await this.clientService.init(userId!);

        if (!await this.clientService.isAuthenticated()) {
            ctx.reply('Welcome to surfstudent_bot, start with /login');
        } else {
            await this.viewTemplate(ctx);
        }
    }

    async login(ctx: Context) {
        try {
            const userId = ctx?.from?.id

            if (await this.clientService.isAuthenticated()) {
                ctx.reply("You already logged in ");

                return;
            }

            ctx.reply("📲 Send your phone number (with country code, e.g., +7XXXXXXXX)");

            userState.set(userId!, {
                inputMode: InputMode.WAITING_PHONE
            });
        } catch (error) {
            ctx.reply("❌ Connection failed. Try again.");
            console.log(error);
        }
    }

    async hearText(ctx: Context) {
        const state = userState.get(ctx?.from?.id!) || { inputMode: InputMode.IDLE };

        if (state.inputMode === InputMode.WAITING_PHONE) {
            await this.inputPhone(ctx);

            return;
        }

        if (state.inputMode === InputMode.WAITING_CODE) {
            await this.inputCode(ctx);

            return;
        }

        if (state.inputMode === InputMode.WAITING_TEMPLATE) {
            await this.saveTemplate(ctx);

            return;
        }

        await this.reply(ctx);
    }

    async inputPhone(ctx: Context) {
        if (!(ctx?.message && ('text' in ctx.message))) return;
        if (!ctx?.from?.id) return;

        const isValidPhone = new RegExp('^\\+(\\d+){11}$').test(ctx.message.text);

        if (!isValidPhone) {
            ctx.reply("❌ Invalid phone format. Try again");

            return;
        }

        this.clientService.requestCode({
            phoneNumber: ctx.message.text,
            onError: () => ctx.reply("Something went wrong. Try again"),
        })

        ctx.reply("🔢 Send code in format: X X X X X: add spaces between symbols");

        userState.set(ctx.from.id, {
            inputMode: InputMode.WAITING_CODE,
            phone: ctx.message.text,
        });
    }

    async inputCode(ctx: any) {
        const userId = ctx?.from?.id;
        const phoneNumber = userState.get(userId)?.phone!;

        if (!userId || !phoneNumber) return;

        const isValidCode = new RegExp('^\\d \\d \\d \\d \\d$').test(ctx.message.text);

        if (!isValidCode) {
            ctx.reply("❌ Invalid code format. Try again");

            return;
        }

        try {
            const code = ctx.message.text.split(' ').join('');

            await this.clientService.authenticate({
                phoneNumber,
                code,
                onError: () => ctx.reply('❌ Login failed. Try again.'),
            });

            userState.set(userId, {
                inputMode: InputMode.IDLE,
            });

            ctx.reply("🎉 Successfully logged in!");

            await this.viewTemplate(ctx);
        } catch (error) {
            console.log('Signin error', error);
        }
    }

    async template(ctx: Context) {
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

    async setTemplate(ctx: Context) {
        const userId = ctx?.from?.id;
        if (!userId) return;

        userState.set(userId, {
            inputMode: InputMode.WAITING_TEMPLATE,
        });

        ctx.reply('Send your template');
    }

    async saveTemplate(ctx: Context) {

        if (!ctx?.from?.id || !(ctx.message && 'text' in ctx.message)) return;
        const userId = ctx.from.id;
        const message = ctx.message.text;

        await this.storage.saveWelcomeMessage(userId, message);

        ctx.reply('Template successfully saved!');
    }

    async viewTemplate(ctx: Context) {
        if (!ctx?.from?.id) return;
        const userId = ctx.from.id;

        const welcomeMessage = await this.storage.getWelcomeMessage(userId);

        if (welcomeMessage) {
            ctx.reply(`Your template:\\n ${welcomeMessage}`);
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

    async reply(ctx: Context) {
        const message = ctx.message;
        const userId = ctx?.from?.id;


        const { forward_origin: {
            sender_user: {
                id: senderId
            }
        } } = message as Sender

        if (
            !(message && 'text' in message) || !userId
            || message?.from.id === this.bot.botInfo?.id
            || Object.values(BotCommands).includes(message.text.slice(1) as BotCommands)
            || !senderId
        ) return;

        const state = userState.get(userId);

        ctx.reply(message.text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👍', callback_data: 'positive' },
                        { text: '👎', callback_data: 'negative' },
                    ],
                ],
            }
        }).then(sentMessage => {
            userState.set(userId, {
                ...state,
                replyTo: {
                    ...state?.replyTo,
                    [sentMessage.message_id]: senderId
                }
            })

            console.log('messageId save:', sentMessage.message_id, message?.forward_origin);
        })

        ctx.deleteMessage();
    }

    async accept(ctx: Context) {
        await ctx.answerCbQuery();
        const message = ctx.callbackQuery?.message;
        const userId = ctx.from?.id;

        if (!userId) return;

        const replyTo = userState.get(userId)?.replyTo

        if (message?.message_id && replyTo && replyTo[message?.message_id]) {
            this.clientService.sendWelcomeMessage(replyTo[message.message_id])
        }

        ctx.deleteMessage();
    };

    async decline(ctx: Context) {
        await ctx.answerCbQuery();
        ctx.deleteMessage();
    };
}

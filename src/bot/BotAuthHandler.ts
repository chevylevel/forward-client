import { MyContext } from "./Bot";
import { AuthService } from "../client/AuthService";
import { InputMode } from "../types";

export class BotAuthHandler {
    authService: AuthService

    constructor( authService: AuthService) {
        this.authService = authService;
    }

    async login(ctx: MyContext) {
        console.log('login');

        if (ctx.session.isAuthenticated) {
            ctx.reply("You already logged in");

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

        const isValidPhoneCode = new RegExp('^\\d \\d \\d \\d \\d$').test(message.text);

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
        } catch (error) {
            console.log(`SignIn error: ${error}`);
        }
    }
}

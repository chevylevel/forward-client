import dotenv from 'dotenv';

import { BotService} from './BotService';
import { GCDataStorage } from './GCDataStorage';
import { ClienService } from './ClientService';

dotenv.config();

export const API_ID = Number(process.env.API_ID);
export const API_HASH = process.env.API_HASH;
export const BOT_USERNAME = process.env.BOT_USERNAME;
export const BUCKET_NAME = process.env.BUCKET_NAME;
export const SESSION_FILE = process.env.SESSION_FILE;

(async function () {
    const storage = await GCDataStorage.create();
    if (!storage) return;

    const clientService = new ClienService(storage);
    const botService = new BotService(storage, clientService);
    await botService.init();

    process.on("SIGINT", () => {
        console.log("Shutting down gracefully...");
        botService.bot.stop();
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        console.log("Received SIGTERM. Shutting down gracefully...");
        botService.bot.stop();
        process.exit(0);
    });
})();

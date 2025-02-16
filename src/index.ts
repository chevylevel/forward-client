import dotenv from 'dotenv';

import { Bot } from './Bot';
import { GCDataStorage } from './GCDataStorage';
import { BaseClient } from './client/BaseClient';
import { AuthService } from './client/AuthService';

dotenv.config();

export const API_ID = Number(process.env.API_ID);
export const API_HASH = process.env.API_HASH;
export const BOT_USERNAME = process.env.BOT_USERNAME;
export const BUCKET_NAME = process.env.BUCKET_NAME;
export const SERVICE_PHONE = process.env.SERVICE_PHONE;

(async function () {
    const storage = await GCDataStorage.create();
    if (!storage) return;

    const userSessions = await storage.getPreferences('session');
    const clients = new Map<string, BaseClient>();

    for (const userId in userSessions) {
        const session = userId && userSessions[userId];

        const client = new BaseClient(session);

        clients.set(userId, client);
    }

    const authService = new AuthService(clients, storage);
    const bot = new Bot(storage, authService);

    bot.init();

    process.on("SIGINT", () => {
        console.log("Shutting down gracefully...");
        bot.bot.stop();
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        console.log("Received SIGTERM. Shutting down gracefully...");
        bot.bot.stop();
        process.exit(0);
    });
})();

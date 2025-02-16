import { TelegramClient } from "telegram";

export class UserClient {
    client: TelegramClient;

    constructor(client: TelegramClient) {
        this.client = client;
    }

    async sendTemplate(to: number, template: string) {
        try {
            if (!this.client.connected) throw new Error('Client is not connected on sendMessage');

            await this.client.sendMessage(
                to,
                { message: template }
            );
        } catch (error) {
            console.log('Welcome message sending error:', error);
        }
    }
}

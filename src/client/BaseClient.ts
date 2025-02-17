import { TelegramClient } from "telegram";
import { API_HASH, API_ID } from '../index';
import { StringSession } from "telegram/sessions";

export class BaseClient {
    client: TelegramClient;
    session: StringSession;

    constructor(session?: string,) {
        this.session = new StringSession(session || '');

        this.client = new TelegramClient(
            this.session,
            API_ID,
            API_HASH!,
            {
                connectionRetries: 5,
            }
        );
    }

    async connect(onError?: () => void) {
        try {
            if (!this.client.connected) {
                await this.client.connect();
                console.log('client connected:', this.client.connected);
            }
        } catch (error) {
            console.log('Client connection error:', error);
            onError && onError();
        }
    }
}

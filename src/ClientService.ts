import { TelegramClient } from "telegram";
import { API_HASH, API_ID, BOT_USERNAME } from './index';
import { NewMessage, NewMessageEvent } from "telegram/events";
import { regexTestMessage } from "./recognition/regexTestMessage";
import { aiTestMessage } from "./recognition/aiTestMessage";
import { GCDataStorage } from "./GCDataStorage";
import { StringSession } from "telegram/sessions";
import { AuthenticateParams, RequestCodeParams } from "./types";

export class ClienService {
    client!: TelegramClient;
    storage: GCDataStorage;
    session!: StringSession;
    userId!: number;

    constructor(storage: GCDataStorage) {
        this.storage = storage;
    }

    async init(userId: number) {
        const session = await this.loadSession();
        this.session = session;
        this.userId = userId;

        this.client = new TelegramClient(
            session,
            API_ID,
            API_HASH!,
            { connectionRetries: 5 }
        );

        try {
            await this.client.connect();
        } catch (error) {
            console.log('Client connection error:', error);
        }

        this.client.addEventHandler(
            this.handleNewMessage,
            new NewMessage({ func: event => !event.isPrivate })
        );
    }

    async loadSession() {
        const userSession = await this.storage.getSession(this.userId);

        return new StringSession(userSession);
    }

    async saveSession() {
        this.storage.saveSession({ [this.userId]: this.session.save() });
    }

    async requestCode({
        phoneNumber,
        onError,
    }: RequestCodeParams) {
        try {
            await this.client.sendCode(
                {
                    apiHash: API_HASH!,
                    apiId: API_ID,
                },
                phoneNumber,
            );
        } catch (error) {
            console.log('Request code error:', error);
            onError();
        }
    }

    async authenticate({
        phoneNumber,
        code,
        onError,
    }: AuthenticateParams) {
        try {
            await this.client.signInUser(
                {
                    apiId: API_ID,
                    apiHash: API_HASH!
                },
                {
                    phoneNumber,
                    phoneCode: async () => code,
                    onError: (err) => { throw new Error(`Login Error:, ${err}`) }
                }
            );

            await this.saveSession();
        } catch (error) {
            console.log('Authentication error:', error);
            onError();
        }
    }

    async isAuthenticated() {
        try {
            if (!this.client?.connected) await this.client.connect();
            const me = await this.client.getMe();

            return !!me;
        } catch (error) {
            console.log('Getting user status error:', error);

            return false;
        }
    }

    async handleNewMessage(event: NewMessageEvent) {
        const message = event.message;

        if (message.text) {
            const match = regexTestMessage(message.text);

            if (!match) return;

            try {
                const aiApproved = await aiTestMessage(message.text);

                aiApproved && await this.client.forwardMessages(
                    BOT_USERNAME!,
                    {
                        fromPeer: message.peerId,
                        messages: message.id
                    }
                );
            } catch (error) {
                console.log("Forwarding message error: ", error);
            }

        }
    }

    async sendWelcomeMessage(customerId: number) {
        try {
            const welcomeMessage = await this.storage.getWelcomeMessage(this.userId);
            if (!customerId || !welcomeMessage) return;

            await this.client.sendMessage(
                customerId,
                { message: welcomeMessage }
            );
        } catch (error) {
            console.log('Welcome message sending error:', error);
        }
    }
}

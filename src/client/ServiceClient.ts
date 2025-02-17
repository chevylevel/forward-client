import { BOT_USERNAME } from '../index';
import { NewMessage, NewMessageEvent } from "telegram/events";
import { regexTestMessage } from "../recognition/regexTestMessage";
import { aiTestMessage } from "../recognition/aiTestMessage";
import { TelegramClient } from 'telegram';

export class ServiceClient {
    client: TelegramClient;

    constructor(client: TelegramClient) {
        this.client = client;
    }

    init() {
        this.client.addEventHandler(
            this.handleNewMessage.bind(this),
            new NewMessage({
                func(event) {
                    return !event.isPrivate
                },
            })
        );
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
}

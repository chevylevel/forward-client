import { NewMessage, NewMessageEvent } from "telegram/events";
import { regexTestMessage } from "../recognition/regexTestMessage";
import { aiTestMessage } from "../recognition/aiTestMessage";
import { BaseClient } from "./BaseClient";

export class ServiceClient extends BaseClient {
    constructor() {
        super();
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

        this.client.connect();
    }

    async handleNewMessage(event: NewMessageEvent) {
        const message = event.message;

        if (message.text) {
            const match = regexTestMessage(message.text);
            if (!match) return;

            try {
                const aiApproved = await aiTestMessage(message.text);


                aiApproved && await this.client.forwardMessages(
                    process.env.SERVICE_CHANNEL!,
                    {
                        fromPeer: message.peerId,
                        messages: message.id
                    }
                );

                // const chatIdNumber = (message.peerId as Api.PeerChannel).channelId.toJSNumber();
                // const messageId = message.id;
                // let originalMessageLink;
                // if (chatIdNumber && messageId) {
                //     originalMessageLink = `<a href="https://t.me/c/${Math.abs(chatIdNumber)}/${messageId}">Original message</a>`;
                // }

            } catch (error) {
                console.log("Forwarding message error: ", error);
            }
        }
    }
}

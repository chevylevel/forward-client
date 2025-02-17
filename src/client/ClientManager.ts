import { TelegramClient } from "telegram";
import { ServiceClient } from "./ServiceClient";
import { UserClient } from "./UserClient";

type InitParams = {
    client: TelegramClient,
    isService: boolean,
    onInit: (message: string) => void
}

export class ClientManager {
    private serviceClient?: ServiceClient;
    private userClient?: UserClient;

    init({ client, isService, onInit }: InitParams) {
        if (isService) {
            this.serviceClient = new ServiceClient(client);
            this.serviceClient.init();

            console.log('New messages listening ...');
            onInit('New messages listening ...');

            return;
        }
        this.userClient = new UserClient(client);

        onInit('New messages listening ...');
    }

    getServiceClient() {
        return this.serviceClient;
    }

    getUserClient() {
        return this.userClient;
    }
}

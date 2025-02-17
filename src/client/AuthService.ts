import { API_HASH, API_ID, SERVICE_PHONE } from '../index';
import { AuthenticateParams, RequestCodeParams } from "../types";
import { GCDataStorage } from "../GCDataStorage";
import { BaseClient } from "./BaseClient";
import { Api } from 'telegram';

export class AuthService {
    clients: Map<string, BaseClient>;
    storage: GCDataStorage;

    constructor(
        clients: Map<string, BaseClient>,
        storage: GCDataStorage,
    ) {
        this.clients = clients;
        this.storage = storage;
    }

    async getClient(userId: string) {
        let baseClient = this.clients.get(userId);

        if (!baseClient) {
            console.log('creating new client', userId);
            baseClient = new BaseClient();
            this.clients.set(userId, baseClient);
        }

        await baseClient.connect();

        return baseClient.client;
    }

    async requestCode(
        userId: string,
        {
            phoneNumber,
            onError,
        }: RequestCodeParams) {
        const client = await this.getClient(userId);

        console.log('sending code', client?.connected);
        try {
            if (!client.connected) throw new Error('Client is not connected on sendCode');

            const result = await client?.sendCode(
                {
                    apiHash: API_HASH!,
                    apiId: API_ID,
                },
                phoneNumber,
            );

            return result?.phoneCodeHash;
        } catch (error) {
            console.log('RequestCode code error:', error);
            onError();
        }
    }

    async signIn(
        userId: string,
        {
            phoneNumber,
            phoneCode,
            phoneCodeHash,
            onError,
        }: AuthenticateParams) {
        const client = await this.getClient(userId);

        console.log(API_ID, API_HASH, phoneNumber, phoneCode, client?.connected, phoneCodeHash);

        try {
            if (!client.connected) throw new Error('Client is not connected on SignIn');

            await client?.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash,
                    phoneCode,
                })
            );

            console.log('signIn success');

            await this.saveSession(userId);

            console.log('saveSession success');
        } catch (error) {
            onError();
            throw new Error(`authService.signIn error: ${error}`,);
        }
    }

    async getMe(userId: string) {
        const client = await this.getClient(userId);

        try {
            return await client?.getMe();
        } catch (error) {
            console.log(`catch getMe no client, ${error}`);
            return null;
        }
    }

    async isAuth(userId: string) {
        const client = await this.getClient(userId);

        try {
            return await client.isUserAuthorized();
        } catch (error) {
            console.log(`isUserAuthorized checking error: ${error}`);
            return false;
        }
    }

    private async saveSession(userId: string) {
        const session = this.clients.get(userId)?.session;

        console.log('saveSession', session?.serverAddress);
        session && await this.storage.savePreference(userId, { session: session.save() });
    }
}

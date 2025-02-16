import { API_HASH, API_ID } from '../index';
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

            const result = await client?.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash,
                    phoneCode,
                })
            );
            console.log('AuthResult', result);

            await this.saveSession(userId);
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
            return null;
        }
    }

    private async saveSession(userId: string) {
        const session = this.clients.get(userId)?.session;

        console.log('session', session);
        session && this.storage.savePreference(userId, { session: session.save() });
    }
}

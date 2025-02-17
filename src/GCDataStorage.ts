import { Bucket, Storage } from '@google-cloud/storage';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { BUCKET_NAME } from '.';

type GetPreferenceParams = {
    fileName: string;
    key: string
}

export class GCDataStorage {
    storage: Storage;
    bucket: Bucket;

    private constructor(credentials: any) {
        this.storage = new Storage({ credentials });
        this.bucket = this.storage.bucket(BUCKET_NAME!);
    }

    private static async getCredentialsFromSecretManager(client: SecretManagerServiceClient) {
        const [version] = await client.accessSecretVersion({ name: process.env.SECRET_NAME });

        const payloadData = version?.payload?.data
            ? Buffer.from(version.payload.data).toString('utf8')
            : null;

        if (!payloadData) {
            throw new Error("Secret payload data is null or undefined");
        }

        return JSON.parse(payloadData);
    }

    static async create() {
        try {
            const client = new SecretManagerServiceClient();
            const credentials = await this.getCredentialsFromSecretManager(client);

            return new GCDataStorage(credentials);
        } catch (error) {
            console.log('Create cloud storage error:');

            return null;
        }
    }

    async savePreference(userId: string, payload: Record<string, string>) {
        try {
            const file = this.bucket.file(`${userId}.json`);
            const [exists] = await file.exists();
            let currentUserData = {};

            if (exists) {
                const data = await file.download();
                currentUserData = JSON.parse(data.toString());
            }

            await file.save(
                JSON.stringify({ ...currentUserData, ...payload }, null, 2),
                { contentType: 'application/json' }
            );

            console.log(`Saved ${payload} for ${userId}`);
        } catch (error) {
            console.log(`Save prefernce of user ${userId} error:`, error);
        }
    }

    async getPreferences(key: string): Promise<{ [x: string]: any; }> {
        try {
            const [files] = await this.bucket.getFiles();
            if (!files.length) return [];

            const dataPromises = files.map(async (file) => {
                const data = await file.download();

                return { [file.name.split('.')[0]]: JSON.parse(data.toString())[key] }
            });

            return (await Promise.all(dataPromises)).reduce((acc, item) => {
                return Object.assign(acc, item);
            }, {});

        } catch (error) {
            console.log(`Get preferences error:`, error);

            return [];
        }
    }

    async getPreference(fileName: string, key: string): Promise<string | undefined> {
        console.log('getPreference', fileName, key);
        try {
            const file = this.bucket.file(`${fileName}.json`);
            const [exists] = await file.exists();

            if (!exists) {
                console.warn(`File ${fileName}.json does not exist.`);

                await file.save(JSON.stringify({}), {
                    contentType: 'application/json',
                });

                return;
            }

            const data = await file.download();

            return JSON.parse(data.toString())?.[key];
        } catch (error) {
            console.log(`Get preference of ${fileName || "unknown"} error:`, error);
        }
    }
}

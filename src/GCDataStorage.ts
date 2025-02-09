import { Bucket, Storage } from '@google-cloud/storage';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { BUCKET_NAME, SESSION_FILE } from '.';

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
        }
    }

    async getSession(userId: number): Promise<string> {
        try {
            const [file] = await this.bucket.file(SESSION_FILE!).download();
            return JSON.parse(file.toString())[userId];

        } catch (err) {
            console.warn("Session file not found. Creating a new one...");

            await this.saveSession({ [userId]: '' });
            return '';
        }
    }

    async saveSession(session: Record<string, string>): Promise<void> {
        try {
            await this.bucket.file(SESSION_FILE!).save(JSON.stringify(session, null, 2), {
                contentType: "application/json",
            });

            console.log("Session saved to Cloud Storage.");
        } catch (err) {
            console.error("Failed to save session:", err);
        }
    }

    async saveWelcomeMessage(userId: number, text: string) {
        try {
            const file = this.bucket.file(`preferences/${userId}.json`);
            await file.save(
                JSON.stringify({ text }, null, 2),
                { contentType: 'application/json' }
            );

            console.log(`Saved welcome message for ${userId}`);
        } catch (error) {
            console.log(`Save welcome message of user ${userId} error:`, error);
        }
    }

    async getWelcomeMessage(userId: number): Promise<string|null> {
        try {
            const file = this.bucket.file(`preferences/${userId}.json`);
            const data = await file.download();
            return JSON.parse(data.toString()).text;
        } catch (error) {
            console.log(`Get welcome message of user ${userId}  error:`, error);
            return null;
        }
    }

}

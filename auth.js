const dotenv = require('dotenv');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require('readline');
const { appendFileSync } = require('fs');

dotenv.config();
const ENV_FILE = ".env";

if (process.env.SESSION) {
    console.log("Session already exists. Skipping authentication.");
    process.exit(0); // Exit early to avoid re-authentication
}

const saveSession = (session) => {
    appendFileSync(ENV_FILE, `\nSESSION=${session}\n`);
};

const session = new StringSession();

const client = new TelegramClient(
    session,
    parseInt(process.env.API_ID),
    process.env.API_HASH,
    {
        connectionRetries: 5,
    }
);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};

(async () => {
    try {
        await client.start({
            phoneNumber: async () => await askQuestion("Enter your phone number: "),
            phoneCode: async () => await askQuestion("Enter the code sent to Telegram: "),
            onError: (err) => console.log("Error:", err),
        });

        console.log("Successfully logged in!");

        saveSession(session.save());

        console.log("Session saved to .env.");
    } catch (error) {
        console.error("Authentication failed:", error);
    } finally {
        // ✅ Close readline **only after everything is done**
        rl.close();
    }
})();
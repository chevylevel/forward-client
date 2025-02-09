export async function aiTestMessage(userMessage) {
    try {
        const response = await fetch(process.env.GEMINI_URL, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Является ли данное сообщение из публичного канала Telegram запросом на обучение серфингу? В ответ пришли только "true" или "false". Сообщение: "${userMessage}"`
                    }]
                }]
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { candidates } = await response.json();

        return candidates?.[0]?.content?.parts?.[0]?.text?.trim() === 'true';
    } catch (error) {
        console.error("Ошибка при запросе к Gemini:", error);
    }
}

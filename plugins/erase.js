Module({
    pattern: "erase",
    fromMe: true,
    desc: "Wipes the last 100 messages from BOTH sides.",
    type: "owner",
}, async (message) => {
    // 1. Send an initial warning so you know it's working
    const { key } = await message.sendReply("_Ghost Protocol: Erasing chat from both sides... 👻_");

    try {
        // 2. Load the recent messages (100 is usually the safe limit for most libraries)
        const chatHistory = await message.loadMessages(100);

        if (!chatHistory || chatHistory.length === 0) {
            return await message.edit("_No messages found to erase._", message.jid, key);
        }

        // 3. Loop and Unsend
        for (let msg of chatHistory) {
            // This is the specific Baileys logic for 'Delete for Everyone'
            await message.client.sendMessage(message.jid, { 
                delete: msg.key 
            });

            // 🎯 CRITICAL: 500ms delay between deletes to avoid a ban. 
            // Better to be slow than banned!
            await new Promise(r => setTimeout(r, 500));
        }

        return await message.sendReply("_Clean sweep complete. No traces left._");
    } catch (e) {
        console.error(e);
        return await message.sendReply("_Erase failed. Some messages might be too old to delete for everyone._");
    }
});

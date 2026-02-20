const { Module } = require("../main");
const config = require("../config");
const express = require("express");

// This creates a small "bridge" inside my bot 
// so the website can tell the bot what to send.
const setupReceiver = (client) => {
    // We use the client's existing express app if it has one, 
    // or we can hook into the main server.
    const app = client.app || express(); 

    app.post("/delivery", async (req, res) => {
        const { number, plugin, auth_key } = req.body;

        // 1. Security Check: Compare the key from the website with your ENV
        if (auth_key !== config.BOT_COMM_KEY) {
            return res.status(403).json({ error: "Invalid Auth Key" });
        }

        // 2. Format the JID (WhatsApp ID)
        const jid = number.includes("@s.whatsapp.net") ? number : `${number}@s.whatsapp.net`;

        // 3. Define the plugin link (This should match your GitHub Gist or Server link)
        const pluginUrl = `https://gist.github.com/achek-digital/${plugin.replace(/\s+/g, '-').toLowerCase()}/raw`;

        const deliveryTemplate = `*───「 🛒 ACHEK DIGITAL SOLUTIONS 」───*\n\n` +
                                 `*Hello! Thank you for your purchase.*\n\n` +
                                 `*Item:* ${plugin}\n` +
                                 `*Status:* Payment Verified ✅\n\n` +
                                 `*To install, copy and paste this command:* \n\n` +
                                 ` \`.install ${pluginUrl}\` \n\n` +
                                 `_Need help? Reply to this message to chat with us._`;

        try {
            // 4. Send the message through the bot
            await client.sendMessage(jid, { text: deliveryTemplate });
            res.json({ status: "success", message: "Plugin delivered via WhatsApp" });
        } catch (error) {
            console.error("Delivery Error:", error);
            res.status(500).json({ error: "Failed to send WhatsApp message" });
        }
    });
};

// This tells the bot to start the receiver when it boots up
Module(
    {
        on: "start",
    },
    async (clientObj) => {
        const botClient = clientObj.user ? clientObj : clientObj.client;
        setupReceiver(botClient);
    }
);

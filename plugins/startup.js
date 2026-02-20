const { Module } = require("../main");
const config = require("../config");

Module(
  {
    on: "text",
    fromMe: true, // Only trigger on messages sent by the bot itself
  },
  async (message) => {
    // 1. Intercept the hardcoded Raganork message
    if (message.text && message.text.includes("Raganork started!")) {
      try {
        // 2. Immediately delete the original message
        if (message.data && message.data.key) {
          await message.client.sendMessage(message.jid, { delete: message.data.key });
        }

        // Calculate disabled commands count
        const disabledCount = (config.DISABLED_COMMANDS && typeof config.DISABLED_COMMANDS === "string") 
          ? config.DISABLED_COMMANDS.split(",").filter(c => c.trim()).length 
          : 0;

        // 3. Build your custom AchekBot message
        const startupText = `*_AchekBot started!_*\n\n` +
          `_Mode         :_ *${config.MODE.charAt(0).toUpperCase() + config.MODE.slice(1)}*\n` +
          `_Language :_ *${config.LANGUAGE.charAt(0).toUpperCase() + config.LANGUAGE.slice(1)}*\n` +
          `_Sudo         :_ *${config.SUDO || "None"}*\n` +
          `_Handlers  :_ *${config.HANDLERS}*\n\n` +
          `*_Extra Configurations_*\n\n` +
          `_Always online_ ${config.ALWAYS_ONLINE ? "✅" : "❌"}\n` +
          `_Auto status viewer_ ${config.AUTO_READ_STATUS ? "✅" : "❌"}\n` +
          `_Auto reject calls_ ${config.REJECT_CALLS ? "✅" : "❌"}\n` +
          `_Auto read msgs_ ${config.READ_MESSAGES ? "✅" : "❌"}\n` +
          `_PM disabler_ ${config.DIS_PM ? "✅" : "❌"}\n` +
          `_PM blocker_ ${config.PMB_VAR ? "✅" : "❌"}\n` +
          `_Disabled commands:_  *${disabledCount}*️⃣\n`;

        // 4. Send the new message disguised as a channel forward
        await message.client.sendMessage(message.jid, {
          text: startupText,
          contextInfo: {
            forwardingScore: 999, // Adds the Forwarded tag
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "120363402198872825@newsletter", // Your specific Channel JID
              newsletterName: "Achek Digital Solutions",
              serverMessageId: -1
            }
          }
        });
      } catch (error) {
        console.error("Failed to intercept startup message:", error);
      }
    }
  }
);

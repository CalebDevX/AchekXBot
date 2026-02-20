const { Module } = require("../main");
const config = require("../config");

Module(
  {
    on: "start", // 🎯 Triggers perfectly the moment the bot comes online!
    fromMe: true,
  },
  async (message) => {
    try {
      // Calculate disabled commands
      const disabledCount = (config.DISABLED_COMMANDS && typeof config.DISABLED_COMMANDS === "string") 
        ? config.DISABLED_COMMANDS.split(",").filter(c => c.trim()).length 
        : 0;

      // Build the AchekBot message
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

      // Get your bot's own phone number to send the message to
      const botNumber = message.client.user.id.split(":")[0] + "@s.whatsapp.net";

      // Send the custom message forwarded from your Channel
      await message.client.sendMessage(botNumber, {
        text: startupText,
        contextInfo: {
          forwardingScore: 999, // Triggers the "Forwarded" tag
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363402198872825@newsletter", // Your Achek Digital Solutions Channel
            newsletterName: "Achek Digital Solutions",
            serverMessageId: -1
          }
        }
      });
    } catch (error) {
      console.error("Failed to send custom startup message:", error);
    }
  }
);

const { Module } = require("../main");
const config = require("../config");

// Nigerian Slang and Natural Language Patterns
const responses = {
  greetings: [
    "How far na?",
    "Wetin dey happen?",
    "I greet you o!",
    "Abeg, how body?",
    "Everything set?",
    "Shoo, you still dey?",
  ],
  general: [
    "No wahala at all.",
    "Omo, things serious o.",
    "Abeg leave that matter.",
    "God go help us.",
    "I don hear you.",
    "E go be.",
  ],
  laughter: [
    "LMAO! You funny o.",
    "Hehehe, I die for here.",
    "Shoo! This one loud.",
  ],
  agreement: [
    "True talk!",
    "I follow you.",
    "Confirm!",
    "Standard!",
  ],
  refusal: [
    "Abeg shift.",
    "I no fit join that one.",
    "Comot for there!",
  ],
};

const patterns = [
  { regex: /\b(how far|wetin|sup)\b/i, category: "greetings" },
  { regex: /\b(lol|lmao|haha|😂|🤣)\b/i, category: "laughter" },
  { regex: /\b(yes|correct|true|standard|confirm)\b/i, category: "agreement" },
  { regex: /\b(no|never|can't|won't|shift)\b/i, category: "refusal" },
];

function getNaturalResponse(text) {
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      const options = responses[pattern.category];
      return options[Math.floor(Math.random() * options.length)];
    }
  }
  
  // Default Nigerian fallback
  const fallback = responses.general[Math.floor(Math.random() * responses.general.length)];
  return fallback;
}

Module(
  {
    on: "text",
    fromMe: false,
  },
  async (message) => {
    // Only respond if local chatbot is enabled via config
    if (config.LOCAL_CHATBOT !== "true") return;
    
    // Don't respond to bot messages or commands
    if (message.fromMe) return;
    
    const text = message.text;
    if (!text || text.length < 2) return;
    
    // Check if it's a command
    const handlers = (config.HANDLERS || ".,").split("");
    if (handlers.some(h => text.startsWith(h))) return;

    // Determine if we should respond (same logic as before: DM or Mention/Reply in Group)
    let shouldRespond = false;
    if (!message.isGroup) {
      shouldRespond = true;
    } else {
      const botJid = message.client.user?.lid;
      if (message.mention && message.mention.some(jid => jid.split("@")[0] === botJid?.split(":")[0])) {
        shouldRespond = true;
      }
      if (message.reply_message && message.reply_message.jid?.split("@")[0] === botJid?.split(":")[0]) {
        shouldRespond = true;
      }
    }

    if (shouldRespond) {
      const response = getNaturalResponse(text);
      await message.sendReply(response);
    }
  }
);

Module(
  {
    pattern: "localbot ?(.*)",
    fromMe: true,
    desc: "Manage local Nigerian-style chatbot",
    usage: ".localbot on/off",
  },
  async (message, match) => {
    const input = match[1]?.trim().toLowerCase();
    const { setVar } = require("./manage");

    if (input === "on") {
      await setVar("LOCAL_CHATBOT", "true");
      return await message.sendReply("*_🇳🇬 Local Chatbot Enabled!_*\n_I will now speak like a true Nigerian._");
    } else if (input === "off") {
      await setVar("LOCAL_CHATBOT", "false");
      return await message.sendReply("*_🇳🇬 Local Chatbot Disabled._*");
    } else {
      const status = config.LOCAL_CHATBOT === "true" ? "Enabled ✅" : "Disabled ❌";
      return await message.sendReply(`*_🇳🇬 Local Chatbot Status:_* \`${status}\`\n\n_Use \`.localbot on/off\` to manage._`);
    }
  }
);

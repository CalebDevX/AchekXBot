const { Module } = require("../main");
const config = require("../config");
const axios = require("axios");
const fromMe = config.MODE !== "public";
const { setVar } = require("./manage");
const fs = require("fs");
const { callGenerativeAI } = require("./utils/misc");

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

// 2026 Modernised Model Stack
const models = [
  "gemini-3.1-pro-preview", 
  "gemini-3-flash",         
  "gemini-3-pro",           
  "gemini-3-deep-think",    
];

const chatbotStates = new Map();
const chatContexts = new Map();
const modelStates = new Map();

let globalSystemPrompt =
  "You are a helpful AI assistant named AchekBot. Be concise, friendly, and informative.";

// ==========================================
// UTILITY FUNCTIONS (WITH STRICT OFF MEMORY)
// ==========================================

async function initChatbotData() {
  try {
    // Load enabled chats
    const chatbotData = config.CHATBOT || "";
    if (chatbotData) {
      chatbotData.split(",").filter((jid) => jid.trim()).forEach((jid) => {
        chatbotStates.set(jid.trim(), true);
        modelStates.set(jid.trim(), 0);
      });
    }

    // Load explicitly disabled chats so global settings don't override them
    const chatbotOffData = config.CHATBOT_OFF || "";
    if (chatbotOffData) {
      chatbotOffData.split(",").filter((jid) => jid.trim()).forEach((jid) => {
        chatbotStates.set(jid.trim(), false);
      });
    }

    const systemPrompt = config.CHATBOT_SYSTEM_PROMPT;
    if (systemPrompt) globalSystemPrompt = systemPrompt;
  } catch (error) {
    console.error("Error initialising chatbot data:", error);
  }
}

async function saveChatbotData() {
  try {
    const enabledChats = [];
    const disabledChats = [];
    
    for (const [jid, enabled] of chatbotStates.entries()) {
      if (enabled === true) enabledChats.push(jid);
      if (enabled === false) disabledChats.push(jid);
    }
    
    await setVar("CHATBOT", enabledChats.join(","));
    await setVar("CHATBOT_OFF", disabledChats.join(","));
  } catch (error) {
    console.error("Error saving chatbot data:", error);
  }
}

async function saveSystemPrompt(prompt) {
  try {
    globalSystemPrompt = prompt;
    await setVar("CHATBOT_SYSTEM_PROMPT", prompt);
  } catch (error) {
    console.error("Error saving system prompt:", error);
  }
}

async function reportToSudo(client, error, chatJid) {
  try {
    const sudoUsers = config.SUDO ? config.SUDO.split(",") : [];
    if (sudoUsers.length > 0) {
      const primarySudo = sudoUsers[0] + "@s.whatsapp.net";
      const report = `⚠️ *AchekBot AI Error*\n\n*Chat:* \`${chatJid}\`\n*Error:* \`${error.message}\`\n*Time:* ${new Date().toLocaleTimeString()}`;
      await client.sendMessage(primarySudo, { text: report });
    }
  } catch (e) {
    console.error("Failed to notify sudo user:", e);
  }
}

async function imageToGenerativePart(imageBuffer, mimeType = "image/jpeg") {
  try {
    return {
      inlineData: { mimeType: mimeType, data: imageBuffer.toString("base64") },
    };
  } catch (error) {
    console.error("Error processing media:", error.message);
    return null;
  }
}

function isChatbotEnabled(jid) {
  // STRICT OVERRIDES: Manual settings always win
  if (chatbotStates.get(jid) === false) return false; 
  if (chatbotStates.get(jid) === true) return true;

  // GLOBAL SETTINGS: Only apply if no strict override exists
  const isGroup = jid.includes("@g.us");
  if (isGroup && config.CHATBOT_ALL_GROUPS === "true") return true;
  if (!isGroup && config.CHATBOT_ALL_DMS === "true") return true;
  
  return false;
}

function clearContext(jid) {
  chatContexts.delete(jid);
}

// ==========================================
// CORE AI ENGINE
// ==========================================

async function getAIResponse(message, chatJid, options = {}) {
  const { imageBuffer = null, audioBuffer = null, isDeepThink = false } = options;
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) return "_❌ GEMINI_API_KEY not configured. Use `.setvar GEMINI_API_KEY your_key`_";

  const currentModelIndex = modelStates.get(chatJid) || 0;
  const currentModel = isDeepThink ? "gemini-3-deep-think" : models[currentModelIndex];

  try {
    const apiUrl = `${API_BASE_URL}${currentModel}:generateContent?key=${apiKey}`;
    const context = chatContexts.get(chatJid) || [];

    const contents = [{ role: "user", parts: [{ text: `System Instruction: ${globalSystemPrompt}` }] }];

    const recentContext = context.slice(-12);
    recentContext.forEach((msg) => {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] });
    });

    const parts = [{ text: message || "Please analyse this media." }];
    if (imageBuffer) {
      const imgPart = await imageToGenerativePart(imageBuffer, "image/jpeg");
      if (imgPart) parts.push(imgPart);
    }
    if (audioBuffer) {
      const audioPart = await imageToGenerativePart(audioBuffer, "audio/ogg");
      if (audioPart) parts.push(audioPart);
    }
    contents.push({ role: "user", parts: parts });

    const payload = {
      contents: contents,
      tools: [{ google_search_retrieval: { dynamic_retrieval_config: { mode: "MODE_DYNAMIC", dynamic_threshold: 0.7 } } }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.75 },
      ...(isDeepThink && { thinkingConfig: { includeThoughts: true } })
    };

    const response = await axios.post(apiUrl, payload, { headers: { "Content-Type": "application/json" }, timeout: 25000 });

    if (response.data?.candidates?.[0]?.content?.parts) {
      const aiParts = response.data.candidates[0].content.parts;
      let aiResponseText = "";
      let thoughts = "";
      
      aiParts.forEach(p => {
        if (p.thought) thoughts += `*Thinking Process:*\n> _${p.text}_\n\n`;
        else if (p.text) aiResponseText += p.text;
      });

      const finalOutput = isDeepThink ? `${thoughts}*Answer:*\n${aiResponseText}` : aiResponseText;

      if (!chatContexts.has(chatJid)) chatContexts.set(chatJid, []);
      const contextArray = chatContexts.get(chatJid);
      
      const contextMessage = audioBuffer ? `${message} [Audio included]` : (imageBuffer ? `${message} [Image included]` : message);
      contextArray.push({ role: "user", text: contextMessage }, { role: "model", text: aiResponseText });

      if (contextArray.length > 20) contextArray.splice(0, contextArray.length - 20);

      return finalOutput;
    } else {
      throw new Error("Unexpected API response format.");
    }
  } catch (error) {
    console.error("AI API Error:", error.message);
    if (error.response && error.response.status === 429) {
      const nextModelIndex = currentModelIndex + 1;
      if (nextModelIndex < models.length) {
        modelStates.set(chatJid, nextModelIndex);
        return "_🔄 Rate limit reached. Switching model and retrying..._"; 
      }
    }
    return null; 
  }
}

initChatbotData();

// ==========================================
// COMMAND: .chatbot (Manager Menu)
// ==========================================

Module(
  {
    pattern: "chatbot ?(.*)",
    fromMe: true,
    desc: "AI Chatbot management with Gemini API",
    usage: "Use .chatbot to see the full menu.",
  },
  async (message, match) => {
    const input = match[1]?.trim();
    const chatJid = message.jid;

    if (!input) {
      const isEnabled = isChatbotEnabled(chatJid);
      const globalGroups = config.CHATBOT_ALL_GROUPS === "true";
      const globalDMs = config.CHATBOT_ALL_DMS === "true";
      const currentModel = models[modelStates.get(chatJid) || 0];
      const contextSize = chatContexts.get(chatJid)?.length || 0;
      const hasApiKey = !!config.GEMINI_API_KEY;

      const helpText =
        `*_🤖 AchekBot Management_*\n\n` +
        `📊 _Status:_ \`${isEnabled ? "Enabled" : "Disabled"}\`\n` +
        `🔑 _API Key:_ \`${hasApiKey ? "Configured ✅" : "Missing ❌"}\`\n` +
        `🌐 _Global Groups:_ \`${globalGroups ? "Enabled ✅" : "Disabled ❌"}\`\n` +
        `💬 _Global DMs:_ \`${globalDMs ? "Enabled ✅" : "Disabled ❌"}\`\n` +
        `🤖 _Current Model:_ \`${currentModel}\`\n` +
        `💭 _Memory (Messages):_ \`${contextSize}/12\`\n` +
        `🎯 _System Prompt:_ \`${globalSystemPrompt.substring(0, 50)}...\`\n\n` +
        `*_Commands:_*\n` +
        `- \`.chatbot on/off\` - Toggle in this chat\n` +
        `- \`.chatbot on/off groups\` - Toggle in all groups\n` +
        `- \`.chatbot on/off dms\` - Toggle in all DMs\n` +
        `- \`.chatbot set "prompt"\` - Set system prompt\n` +
        `- \`.chatbot clear\` - Clear chat memory\n` +
        `- \`.chatbot status\` - Show detailed stats`;

      return await message.sendReply(helpText);
    }

    const args = input.split(" ");
    const command = args[0].toLowerCase();
    const target = args[1]?.toLowerCase();

    switch (command) {
      case "on":
        if (!config.GEMINI_API_KEY) return await message.sendReply("_❌ Set GEMINI_API_KEY first._");
        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "true");
          return await message.sendReply(`*_🤖 Chatbot Enabled for All Groups_*`);
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "true");
          return await message.sendReply(`*_🤖 Chatbot Enabled for All DMs_*`);
        } else {
          chatbotStates.set(chatJid, true);
          if (!modelStates.has(chatJid)) modelStates.set(chatJid, 0);
          await saveChatbotData();
          return await message.sendReply(`*_🤖 Chatbot Enabled in this chat_*`);
        }

      case "off":
        if (target === "groups") {
          await setVar("CHATBOT_ALL_GROUPS", "false");
          return await message.sendReply(`*_🤖 Chatbot Disabled for All Groups_*`);
        } else if (target === "dms") {
          await setVar("CHATBOT_ALL_DMS", "false");
          return await message.sendReply(`*_🤖 Chatbot Disabled for All DMs_*`);
        } else {
          chatbotStates.set(chatJid, false); // Strict false applied here
          clearContext(chatJid);
          await saveChatbotData();
          return await message.sendReply(`*_🤖 Chatbot Disabled in this chat_*`);
        }

      case "set":
        const promptMatch = input.match(/set\s+"([^"]+)"/);
        if (!promptMatch) return await message.sendReply(`_Please put the prompt in quotes._`);
        await saveSystemPrompt(promptMatch[1]);
        return await message.sendReply(`*_🎯 System Prompt Updated_*`);

      case "clear":
        clearContext(chatJid);
        return await message.sendReply(`*_💭 Memory Cleared for this chat._*`);

      case "status":
        return await message.sendReply(`*_🤖 Chatbot is ${isChatbotEnabled(chatJid) ? "Active" : "Inactive"}._*`);

      default:
        return await message.sendReply(`_Unknown command. Use .chatbot_`);
    }
  }
);

// ==========================================
// AUTO-RESPONDER (Text & Audio)
// ==========================================

Module(
  { on: "text", fromMe: false },
  async (message) => {
    try {
      if (!isChatbotEnabled(message.jid) || message.fromMe || !config.GEMINI_API_KEY) return;

      let shouldRespond = !message.isGroup;
      if (message.isGroup) {
        const botJid = message.client.user?.lid || message.client.user?.id;
        const botNum = botJid?.split(":")[0];
        
        if (message.mention?.some((jid) => jid.split("@")[0] === botNum)) shouldRespond = true;
        if (message.reply_message?.jid?.split("@")[0] === botNum) shouldRespond = true;
      }

      if (!shouldRespond) return;

      const handlers = config.HANDLERS || ".,";
      if (handlers.split("").some(prefix => message.text.startsWith(prefix))) return;

      let imageBuffer = null;
      let responseText = message.text;

      if (message.reply_message?.image) {
        imageBuffer = await message.reply_message.download("buffer");
        if (!responseText || responseText.length < 2) responseText = "What is this?";
      }

      const aiResponse = await getAIResponse(responseText, message.jid, { imageBuffer });
      if (aiResponse) await message.sendReply(aiResponse);

    } catch (error) {
      await reportToSudo(message.client, error, message.jid);
    }
  }
);

Module(
  { on: "audio", fromMe: false },
  async (message) => {
    if (!isChatbotEnabled(message.jid) || message.fromMe || !config.GEMINI_API_KEY) return;
    
    let shouldRespond = !message.isGroup;
    if (message.isGroup && message.reply_message?.jid?.includes(message.client.user?.id.split(":")[0])) {
      shouldRespond = true;
    }
    
    if (!shouldRespond) return;

    try {
      const audioBuffer = await message.download("buffer");
      const aiResponse = await getAIResponse("Listen to this audio and reply.", message.jid, { audioBuffer });
      if (aiResponse) await message.sendReply(aiResponse);
    } catch (error) {
       await reportToSudo(message.client, error, message.jid);
    }
  }
);

// ==========================================
// COMMAND: .ai (Manual Trigger & Deep Think)
// ==========================================

Module(
  {
    pattern: "ai ?(.*)",
    fromMe,
    desc: "Ask AI. Use .ai think [prompt] for reasoning.",
    type: "ai",
  },
  async (message, match) => {
    let input = match[1]?.trim() || "";
    const isDeepThink = input.toLowerCase().startsWith("think ");
    let prompt = isDeepThink ? input.replace(/^think\s+/i, "") : input;

    let imageBuffer = null;
    let audioBuffer = null;

    if (message.reply_message) {
      if (message.reply_message.image) imageBuffer = await message.reply_message.download("buffer");
      if (message.reply_message.audio) audioBuffer = await message.reply_message.download("buffer");
      if (!prompt && message.reply_message.text) prompt = message.reply_message.text;
    }

    if (!prompt && !imageBuffer && !audioBuffer) {
      return await message.sendReply("Please provide a prompt or reply to media.");
    }

    let sent_msg = await message.sendReply(isDeepThink ? "_Deeply analysing your request... 🧠_" : "_Thinking..._");

    try {
      const response = await getAIResponse(prompt, message.jid, { imageBuffer, audioBuffer, isDeepThink });
      
      if (response) {
        await message.edit(response, message.jid, sent_msg.key);
      } else {
        await message.edit("❌ API Error. Sudo has been notified.", message.jid, sent_msg.key);
      }
    } catch (error) {
      await reportToSudo(message.client, error, message.jid);
      await message.edit("❌ Failed to process request.", message.jid, sent_msg.key);
    }
  }
);

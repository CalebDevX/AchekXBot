/**
 * Caleb AchekBot - Main Entry Point
 * * This script initializes the database, configures the bot manager,
 * and handles process lifecycle events for the WhatsApp bot.
 */

const path = require("path");
const fs = require("fs");
const http = require("http");

// Load environment variables from .env file if it exists
if (fs.existsSync("./config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

const { suppressLibsignalLogs, ensureTempDir, TEMP_DIR, initializeKickBot, cleanupKickBot } = require("./core/helpers");
const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
const config = require("./config");
const { SESSION, logger } = config;

/**
 * Main application entry point
 */
async function main() {
  // 1. Setup environment
  ensureTempDir();
  suppressLibsignalLogs();
  
  console.log(`--- AchekBot v${require("./package.json").version} ---`);
  console.log(`- Configured sessions: ${SESSION.length > 0 ? SESSION.join(", ") : "None"}`);
  
  if (SESSION.length === 0) {
    const warnMsg = "⚠️ No sessions configured. Please set SESSION environment variable.";
    console.warn(warnMsg);
    logger.warn(warnMsg);
    // Don't exit here, allows the server to keep running if desired, 
    // but the bot functionality won't work.
  }

  // 2. Initialize Database
  try {
    await initializeDatabase();
    console.log("- Database initialized");
    logger.info("Database initialized successfully.");
  } catch (dbError) {
    const errorMsg = "🚫 Failed to initialize database. Bot cannot start.";
    console.error(errorMsg, dbError);
    logger.fatal({ err: dbError }, errorMsg);
    process.exit(1);
  }

  // 3. Initialize Bot Manager
  const botManager = new BotManager();

  // 4. Setup Shutdown Handlers
  const shutdownHandler = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down...`);
    
    // Cleanup temporary files and stop the "kick" interval
    cleanupKickBot();
    
    // Gracefully shutdown all bot instances
    await botManager.shutdown();
    
    process.exit(0);
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  // 5. Start the Bots
  try {
    await botManager.initializeBots();
    console.log("- Bot initialization complete.");
    logger.info("Bot initialization complete.");
    
    // Start automated task for kicking (if configured in helpers)
    initializeKickBot();
  } catch (error) {
    console.error("Error during bot initialization:", error);
    logger.error({ err: error }, "Error during bot initialization");
  }

  // 6. Optional: Start Health Check Server
  // Useful for platforms like Heroku, Render, or Railway that expect an open port
  const startServer = () => {
    const PORT = process.env.PORT || 3000;

    const server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("AchekBot is running!");
      }
    });

    server.listen(PORT, () => {
      logger.info(`Web server listening on port ${PORT}`);
      console.log(`- Health check server running on port ${PORT}`);
    });
  };

  if (process.env.USE_SERVER !== "false") {
    startServer();
  }
}

// Execute main with error catching
main().catch((error) => {
  const fatalMsg = "Fatal error in main execution loop";
  console.error(`${fatalMsg}: ${error.message}`, error);
  logger.fatal({ err: error }, fatalMsg);
  process.exit(1);
});


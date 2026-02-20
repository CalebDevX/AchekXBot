const simpleGit = require("simple-git");
const git = simpleGit();
const { Module } = require("../main");
const config = require("../config");
const fs = require("fs").promises;
const axios = require("axios");

const handler = config.HANDLERS !== "false" ? config.HANDLERS.split("")[0] : "";
const localPackageJson = require("../package.json");

async function isGitRepo() {
  try {
    await fs.access(".git");
    return true;
  } catch (e) {
    return false;
  }
}

async function getRemoteVersion() {
  try {
    // 🎯 UPDATED: Now points strictly to your AchekXBot repository
    const remotePackageJsonUrl = `https://raw.githubusercontent.com/CalebDevX/AchekXBot/main/package.json`;
    const response = await axios.get(remotePackageJsonUrl);
    return response.data.version;
  } catch (error) {
    throw new Error("Failed to fetch remote version");
  }
}

Module(
  {
    pattern: "update ?(.*)",
    fromMe: true,
    desc: "Checks for and applies bot updates via Render Deploy Hook.",
    use: "owner",
  },
  async (message, match) => {
    if (!(await isGitRepo())) {
      return await message.sendReply("_This bot isn't running from a Git repository. Automatic updates aren't available._");
    }

    const command = match[1] ? match[1].toLowerCase() : "";
    let processingMsg;

    try {
      await git.fetch();
      // Ensure we compare against your main branch
      const commits = await git.log(["main" + "..origin/" + "main"]);
      const localVersion = localPackageJson.version;
      let remoteVersion;

      try {
        remoteVersion = await getRemoteVersion();
      } catch (error) {
        return await message.sendReply("_Failed to check remote version. Please try again later._");
      }

      const hasCommits = commits.total > 0;
      const versionChanged = remoteVersion !== localVersion;

      if (!hasCommits && !versionChanged) {
        return await message.sendReply("_AchekBot is fully up to date!_");
      }

      const isBetaUpdate = hasCommits && !versionChanged;
      const isStableUpdate = hasCommits && versionChanged;

      if (!command) {
        processingMsg = await message.sendReply("_Checking for updates..._");
        let updateInfo = "";

        if (isStableUpdate) {
          updateInfo = `*_UPDATE AVAILABLE_*\n\n`;
          updateInfo += `📦 Current version: *${localVersion}*\n`;
          updateInfo += `📦 New version: *${remoteVersion}*\n\n`;
          updateInfo += `*_CHANGELOG:_*\n\n`;
          for (let i in commits.all) {
            updateInfo += `${parseInt(i) + 1}• *${commits.all[i].message}*\n`;
          }
          updateInfo += `\n_Use "${handler}update start" to apply the update on Render._`;
        } else if (isBetaUpdate) {
          updateInfo = `*_BETA UPDATE AVAILABLE_*\n\n`;
          updateInfo += `📦 Current version: *${localVersion}*\n`;
          updateInfo += `⚠️ New commits available (version unchanged)\n\n`;
          updateInfo += `*_CHANGELOG:_*\n\n`;
          for (let i in commits.all) {
            updateInfo += `${parseInt(i) + 1}• *${commits.all[i].message}*\n`;
          }
          updateInfo += `\n_Use "${handler}update beta" to apply beta updates on Render._`;
        }

        return await message.edit(updateInfo, message.jid, processingMsg.key);
      }

      if (command === "start" || command === "beta") {
        processingMsg = await message.sendReply("_Starting Render update..._");

        // Uses the deploy hook you will set in Render's environment variables
        const deployHookUrl = process.env.RENDER_DEPLOY_HOOK;

        if (deployHookUrl) {
          // Trigger the Render rebuild via the hook (Render prefers POST for hooks, but GET often works too. POST is safer.)
          await axios.post(deployHookUrl);
          return await message.edit(
            `_Render deploy triggered successfully! AchekBot version ${remoteVersion} will restart in a few minutes._`,
            message.jid,
            processingMsg.key
          );
        } else {
          // Fallback if the bot isn't finding the Render URL
          await git.reset("hard", ["HEAD"]);
          await git.pull();
          await message.edit(
            `_Successfully pulled update. Please restart the bot manually._`,
            message.jid,
            processingMsg.key
          );
          process.exit(0);
        }
      } else {
        return await message.sendReply(`_Invalid command. Use "${handler}update start"._`);
      }
    } catch (error) {
      console.error("Update error:", error);
      return await message.sendReply("_An error occurred while checking for updates._");
    }
  }
);

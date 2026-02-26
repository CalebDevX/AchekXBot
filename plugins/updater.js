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
    // 🎯 Points strictly to your AchekXBot repository
    const remotePackageJsonUrl = `https://raw.githubusercontent.com/CalebDevX/AchekXBot/main/package.json`;
    const response = await axios.get(remotePackageJsonUrl);
    return response.data.version;
  } catch (error) {
    throw new Error("Failed to fetch remote version");
  }
}

// 🎯 SMART COMPARISON: Checks if Version A is strictly GREATER than Version B
const isNewer = (remote, local) => {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
};

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
      const commits = await git.log(["main" + "..origin/" + "main"]);
      const localVersion = localPackageJson.version;
      let remoteVersion;

      try {
        remoteVersion = await getRemoteVersion();
      } catch (error) {
        return await message.sendReply("_Failed to check remote version. Please try again later._");
      }

      const hasCommits = commits.total > 0;
      // 🎯 FIXED: This will be false if remote is 6.2.26 but local is 3.0.0 (unless 6 > 3)
      const isStableUpdate = isNewer(remoteVersion, localVersion);

      // 🎯 SILENCE LOGIC: If no new commits and version is NOT newer, stop the nagging.
      if (!hasCommits && !isStableUpdate) {
        if (!command) return await message.sendReply(`_AchekBot v${localVersion} is stable. No new updates found._`);
      }

      if (!command) {
        processingMsg = await message.sendReply("_Checking for updates..._");
        let updateInfo = "";

        if (isStableUpdate) {
          updateInfo = `*_NEW ACHEK UPDATE AVAILABLE_*\n\n`;
          updateInfo += `📦 Current version: *${localVersion}*\n`;
          updateInfo += `📦 New version: *${remoteVersion}*\n\n`;
          updateInfo += `*_CHANGELOG:_*\n\n`;
          for (let i in commits.all) {
            updateInfo += `${parseInt(i) + 1}• *${commits.all[i].message}*\n`;
          }
          updateInfo += `\n_Use "${handler}update start" to apply the update on Render._`;
        } else if (hasCommits) {
          updateInfo = `*_BETA/PATCH UPDATE AVAILABLE_*\n\n`;
          updateInfo += `📦 Current version: *${localVersion}*\n`;
          updateInfo += `⚠️ New commits available (Version remains same)\n\n`;
          updateInfo += `*_CHANGELOG:_*\n\n`;
          for (let i in commits.all) {
            updateInfo += `${parseInt(i) + 1}• *${commits.all[i].message}*\n`;
          }
          updateInfo += `\n_Use "${handler}update start" to sync code._`;
        }

        return await message.edit(updateInfo, message.jid, processingMsg.key);
      }

      if (command === "start") {
        processingMsg = await message.sendReply("_Starting Render update..._");

        const deployHookUrl = process.env.RENDER_DEPLOY_HOOK;

        if (deployHookUrl) {
          await axios.post(deployHookUrl);
          return await message.edit(
            `_Render deploy triggered! AchekBot v${remoteVersion} will restart in a few minutes._`,
            message.jid,
            processingMsg.key
          );
        } else {
          // Fallback
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

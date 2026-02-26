const simpleGit = require("simple-git");
const git = simpleGit();
const { Module } = require("../main");
const config = require("../config");
const fs = require("fs").promises;
const axios = require("axios");

const handler = config.HANDLERS !== "false" ? config.HANDLERS.split("")[0] : "";
const localPackageJson = require("../package.json");

/**
 * Checks if the directory is a valid Git repository
 */
async function isGitRepo() {
  try {
    await fs.access(".git");
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Fetches the version number from your master GitHub repository
 */
async function getRemoteVersion() {
  try {
    const remotePackageJsonUrl = `https://raw.githubusercontent.com/CalebDevX/AchekXBot/main/package.json`;
    const response = await axios.get(remotePackageJsonUrl);
    return response.data.version;
  } catch (error) {
    throw new Error("Failed to fetch remote version");
  }
}

/**
 * Smart Version Comparison
 * Returns true if remote is strictly higher than local (e.g., 3.1.0 > 3.0.0)
 */
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
    desc: "Checks for and applies bot updates via Render Deploy Hook with Hard-Sync.",
    use: "owner",
  },
  async (message, match) => {
    if (!(await isGitRepo())) {
      return await message.sendReply("_This bot isn't running from a Git repository._");
    }

    const command = match[1] ? match[1].toLowerCase() : "";
    let processingMsg;

    try {
      // Fetch latest metadata from GitHub
      await git.fetch();
      const commits = await git.log(["main" + "..origin/" + "main"]);
      const localVersion = localPackageJson.version;
      let remoteVersion;

      try {
        remoteVersion = await getRemoteVersion();
      } catch (error) {
        return await message.sendReply("_Failed to check remote version. GitHub might be down._");
      }

      const hasCommits = commits.total > 0;
      const isStableUpdate = isNewer(remoteVersion, localVersion);

      // 🎯 SILENCE LOGIC: If version is same or lower, and no new code, don't nag.
      if (!hasCommits && !isStableUpdate) {
        if (!command) return await message.sendReply(`_AchekBot v${localVersion} is fully up to date!_`);
      }

      // Display Update Info
      if (!command) {
        processingMsg = await message.sendReply("_Checking for updates..._");
        let updateInfo = "";

        if (isStableUpdate) {
          updateInfo = `*_NEW ACHEK UPDATE AVAILABLE_*\n\n`;
          updateInfo += `📦 Current version: *${localVersion}*\n`;
          updateInfo += `📦 New version: *${remoteVersion}*\n\n`;
        } else {
          updateInfo = `*_BETA/PATCH AVAILABLE_*\n\n`;
          updateInfo += `📦 Version: *${localVersion}*\n`;
          updateInfo += `⚠️ New commits found (Code sync required)\n\n`;
        }

        updateInfo += `*_CHANGELOG:_*\n\n`;
        for (let i in commits.all) {
          updateInfo += `${parseInt(i) + 1}• *${commits.all[i].message}*\n`;
        }
        updateInfo += `\n_Use "${handler}update start" to sync and deploy._`;

        return await message.edit(updateInfo, message.jid, processingMsg.key);
      }

      // Execution Logic
      if (command === "start") {
        processingMsg = await message.sendReply("_🚀 Achek Engine: Hard-Syncing with Master..._");

        // 🎯 THE FIX: Force the local bot to match GitHub Main exactly. 
        // This overwrites any local errors cloners might have.
        await git.reset("hard", ["origin/main"]);
        await git.pull("origin", "main");

        const deployHookUrl = process.env.RENDER_DEPLOY_HOOK;

        if (deployHookUrl) {
          // Trigger Render to rebuild using the newly pulled code
          await axios.post(deployHookUrl);
          return await message.edit(
            `_Sync Success! AchekBot v${remoteVersion} is rebuilding on Render. Please wait 2-3 minutes._`,
            message.jid,
            processingMsg.key
          );
        } else {
          // If no hook is present (for local/VPS users)
          await message.edit(
            `_Code synced to v${remoteVersion}. No Render Hook found, please restart manually._`,
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
      return await message.sendReply(`_An error occurred during sync: ${error.message}_`);
    }
  }
);

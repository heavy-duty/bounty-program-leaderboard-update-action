const core = require("@actions/core");
const github = require("@actions/github");
const octokit = require("octokit");

const authenticateGithubApp = async () => {
  const app = new octokit.App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: JSON.parse(process.env.GITHUB_PRIVATE_KEY),
  });
  const octokit = await app.getInstallationOctokit(
    process.env.GITHUB_APP_INSTALLATION
  );

  return octokit.rest;
};

try {
  console.log("Welcome to the github-action");
  const githubAppId = core.getInput("github-app-id");
  const githubPrivateKey = core.getInput("github-private-key");
  const githubAppInstallation = core.getInput("github-app-installation");

  console.log({ githubAppId, githubPrivateKey, githubAppInstallation });
} catch (error) {
  core.setFailed(error.message);
}

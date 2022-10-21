const core = require("@actions/core");
const github = require("@actions/github");
const octokit = require("octokit");

const authenticateGithubApp = async (
  GITHUB_APP_ID,
  GITHUB_PRIVATE_KEY,
  GITHUB_APP_INSTALLATION
) => {
  const app = new octokit.App({
    appId: GITHUB_APP_ID,
    privateKey: JSON.parse(GITHUB_PRIVATE_KEY),
  });
  const octokitApp = await app.getInstallationOctokit(GITHUB_APP_INSTALLATION);

  return octokitApp.rest;
};

const getIssuesPagingUpgrade = async (restApi) => {
  let response = null;
  const per_page = 100;
  const paginated_data = [];
  const MAX_PAGES = 10;
  let i = 1;
  restApi;
  for (i; i < MAX_PAGES; i++) {
    response = await restApi.issues.listForRepo({
      owner: "heavy-duty",
      repo: "bounty-program-test",
      labels: `challenge`,
      page: i,
      per_page: 100,
    });
    console.log("RESPONSE: ", response);
    if (response.data === null || response.data.length === 0) {
      break;
    }

    paginated_data.push(...response.data);
    if (response.data.length < i * per_page) {
      break;
    }
  }

  if (paginated_data.length == 0) {
    console.log(`i got nuthn for you 2..`);
    return null;
  }

  const issues = paginated_data;

  if (!issues.length) {
    return null;
  }
  return issues.reverse();
};

async function run() {
  try {
    console.log("Welcome to the github-action");
    const githubAppId = core.getInput("github-app-id");
    const githubPrivateKey = core.getInput("github-private-key");
    const githubAppInstallation = core.getInput("github-app-installation");

    const restApi = await authenticateGithubApp(
      githubAppId,
      githubPrivateKey,
      githubAppInstallation
    );

    const issues = await getIssuesPagingUpgrade(restApi);

    console.log("ISSUES ->", issues);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

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

const getBountiesLeaderboard = (issues) => {
  // Create two dic one (1) `points: [user]` and the other dict two (2) `user: currentPoint` (LookUp Table)
  const dictOne = {};
  const dictTwo = {};

  issues.forEach((issue, index) => {
    // For each issue, get user and issuePoints and search in dic (2) if the issue owner already exist:
    const user = issue.labels
      .filter((label) => label.name.includes("user:"))[0]
      .name.split(":")[1];
    const issuesPoints = Number(
      issue.labels
        .filter((label) => label.name.includes("points:"))[0]
        .name.split(":")[1]
    );

    /**  
      if not exist:
      -> then
      ---- we add a new entry at dict two (2) user: issuesPoints
      ---- we add a new entry at dic one (1) using the issuesPoints to find the spot // END
      */
    if (!dictTwo[user]) {
      dictTwo[user] = issuesPoints;
      dictOne[issuesPoints] = [user];
      return;
    }

    /**
       if exist:
      -> then 
      ---- remove the user from his current position at dic one (1) and delete the key if value is empty -> []
      ---- get new user points
      ---- add new entry (or update the current one) using the new user points to the dic one (1)
      ---- update the user current points at dict two (2) // END
       */

    const userCurrentPoints = dictTwo[user];
    const usersXRewardIndex = dictOne[userCurrentPoints].indexOf(user);

    dictOne[userCurrentPoints].splice(usersXRewardIndex, 1);

    if (dictOne[userCurrentPoints].length === 0)
      delete dictOne[userCurrentPoints];

    const newReward = userCurrentPoints + issuesPoints;

    dictOne[newReward] = [...(dictOne[newReward] ?? []), user];
    dictTwo[user] = newReward;
    return;
  });

  // now, we create the leaderboard, using the dict one (1)
  const sortedLeaderboardKeys = Object.keys(dictOne).sort(
    (a, b) => Number(b) - Number(a)
  );
  const leaderBoard = [];
  sortedLeaderboardKeys.forEach((points) => {
    dictOne[points].forEach((user) => {
      leaderBoard.push({
        user: {
          login: user,
          university: "testing",
        },
        points: Number(points),
      });
    });
  });

  const leaderboardJsonString = JSON.stringify(leaderBoard);

  console.log(leaderBoard, "\n", leaderboardJsonString, "\n\n");

  return leaderboardJsonString;
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
    const leaderboardJsonString = getBountiesLeaderboard(issues);

    console.log("JSON -->", leaderboardJsonString);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

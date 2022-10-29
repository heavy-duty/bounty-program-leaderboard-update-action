const core = require("@actions/core");
const github = require("@actions/github");
const octokit = require("octokit");
const fetch = require("cross-fetch");

const TIME_REWARD_PERCENTAGE = 20;

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

const getChallenges = async () => {
  const challenges = await fetch(
    "https://lisbon.heavyduty.builders/api/challenges"
  );

  const data = await challenges.json();

  return data;
};

// now = from github issue
// start and end = from challenges
const getChallengeProgress = (challenge, userSubmissionDate) => {
  console.log("ENTER 2", challenge, userSubmissionDate);
  const now = new Date(userSubmissionDate);
  const startDate = new Date(challenge.startDate);
  const endDate = new Date(challenge.endDate);
  console.log("ENTER 2-1", challenge, userSubmissionDate);
  if (now.getTime() < startDate.getTime()) {
    return 0;
  } else if (now.getTime() < endDate.getTime()) {
    const total = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();

    return Math.floor((elapsed / total) * 100);
  } else {
    return 100;
  }
};

const getChallengeBonus = (challenge, userSubmissionDate) => {
  console.log("ENTER 1", challenge, userSubmissionDate);
  const maxBonus = challenge.rewardValue * (TIME_REWARD_PERCENTAGE / 100);
  const progress = getChallengeProgress(challenge, userSubmissionDate);

  return Math.floor(maxBonus * (progress / 100));
};

const getIssuesPagingUpgrade = async (restApi, githubOwner, githubRepo) => {
  let response = null;
  const per_page = 100;
  const paginated_data = [];
  const MAX_PAGES = 10;
  let i = 1;

  for (i; i < MAX_PAGES; i++) {
    response = await restApi.issues.listForRepo({
      owner: githubOwner,
      repo: githubRepo,
      labels: `challenge,completed`,
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

const getBountiesLeaderboard = async (issues) => {
  // Create two dic one [pointsAndUsers] (1) `points: [user]` and the other dict two [userLookupTable] (2) `user: currentPoint` (LookUp Table)
  const pointsAndUsers = {};
  const userLookupTable = {};
  const challenges = await getChallenges();

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
    const challengeId = issue.labels
      .filter((label) => label.name.includes("challengeId:"))[0]
      .name.split(":")[1];

    const userSubmissionDate = issue.created_at;

    console.log(
      "CHALLENGE ID",
      challengeId,
      "User Submission",
      userSubmissionDate
    );

    const currentChallenge = challenges.find(
      (challenge) => challenge.id === challengeId
    );

    const bonusPoints = getChallengeBonus(currentChallenge, userSubmissionDate);
    console.log("BONUS POINTS", bonusPoints);

    console.log("DATA CHALLENGE checkpoint");
    /**  
      if not exist:
      -> then
      ---- we add a new entry at dict two [userLookupTable] (2) user: issuesPoints
      ---- we add a new entry at dic one [pointsAndUsers] (1) using the issuesPoints to find the spot // END
      */
    if (!userLookupTable[user]) {
      userLookupTable[user] = issuesPoints + bonusPoints;
      pointsAndUsers[issuesPoints] = [user];
      return;
    }
    /**
       if exist:
      -> then 
      ---- remove the user from his current position at dic one [pointsAndUsers] (1) and delete the key if value is empty -> []
      ---- get new user points
      ---- add new entry (or update the current one) using the new user points to the dic one [pointsAndUsers] (1)
      ---- update the user current points at dict two [userLookupTable] (2) // END
       */

    const userCurrentPoints = userLookupTable[user];
    const usersXRewardIndex = pointsAndUsers[userCurrentPoints].indexOf(user);

    pointsAndUsers[userCurrentPoints].splice(usersXRewardIndex, 1);

    // if the points X is empty (no user at it) with delete that entry
    if (pointsAndUsers[userCurrentPoints].length === 0)
      delete pointsAndUsers[userCurrentPoints];

    const newReward = userCurrentPoints + issuesPoints + bonusPoints;

    pointsAndUsers[newReward] = [...(pointsAndUsers[newReward] ?? []), user];
    userLookupTable[user] = newReward;
    return;
  });

  // now, we create the leaderboard, using the dict one (1)
  const sortedLeaderboardKeys = Object.keys(pointsAndUsers).sort(
    (a, b) => Number(b) - Number(a)
  );
  const leaderBoard = [];
  sortedLeaderboardKeys.forEach((points) => {
    pointsAndUsers[points].forEach((user) => {
      leaderBoard.push({
        user,
        points: Number(points),
      });
    });
  });

  const leaderboardJsonString = JSON.stringify(leaderBoard);

  return leaderboardJsonString;
};

async function run() {
  try {
    const githubAppId = core.getInput("github-app-id");
    const githubPrivateKey = core.getInput("github-private-key");
    const githubAppInstallation = core.getInput("github-app-installation");
    const githubOwner = core.getInput("github-owner");
    const githubRepo = core.getInput("github-repo");

    const restApi = await authenticateGithubApp(
      githubAppId,
      githubPrivateKey,
      githubAppInstallation
    );

    const issues = await getIssuesPagingUpgrade(
      restApi,
      githubOwner,
      githubRepo
    );
    const leaderboardJsonString = await getBountiesLeaderboard(issues);

    const leaderboardIssue = await restApi.issues.listForRepo({
      owner: githubOwner,
      repo: githubRepo,
      labels: `core:leaderboard`,
      state: "open",
    });

    if (leaderboardIssue.data.length > 0) {
      await restApi.issues.update({
        owner: githubOwner,
        repo: githubRepo,
        issue_number: leaderboardIssue.data[0].number,
        body: leaderboardJsonString,
      });
    } else {
      await restApi.issues.create({
        owner: githubOwner,
        repo: githubRepo,
        title: "Current Leaderboard",
        body: leaderboardJsonString,
        labels: [`core:leaderboard`],
      });
    }

    console.log("JSON 26 -->", leaderboardJsonString);
  } catch (error) {
    core.setFailed("QUE PASO??", error.message);
  }
}

run();

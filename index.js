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

const getProgress = (min, max, value) => {
  console.log("ENTER 2", min, max, value);
  if (value < min) {
    return 0;
  } else if (value < max) {
    const total = max - min;
    const elapsed = value - min;

    return Math.floor((elapsed / total) * 100);
  } else {
    return 100;
  }
};

const getChallengeBonus = (challenge, userSubmissionDate) => {
  console.log("ENTER 1", challenge, userSubmissionDate);
  const maxBonus = challenge.rewardValue * (TIME_REWARD_PERCENTAGE / 100);
  const progressLeft =
    100 -
    getProgress(
      new Date(challenge.startDate).getTime(),
      new Date(challenge.endDate).getTime(),
      new Date(userSubmissionDate).getTime()
    );

  return Math.floor(maxBonus * (progressLeft / 100));
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
    console.log(`i got nuthn for you..`);
    return [];
  }

  const issues = paginated_data;

  if (!issues.length) {
    return null;
  }
  return issues.reverse();
};

const getChallengesLeaderboards = async (issues) => {
  console.log("Getting single leaderboard star!");
  // Create two dic one [pointsAndUsers] (1) `points: [user]` and the other dict two [userLookupTable] (2) `user: currentPoint` (LookUp Table)
  const pointsAndUsers = {};
  const userLookupTable = {};
  // Create two dic one [pointsAndTeams] (1) `points: [team]` and the other dict two [teamLookupTable] (2) `team: currentPoint` (LookUp Table)
  const pointsAndTeams = {};
  const teamLookupTable = {};

  const challenges = await getChallenges();
  console.log("Challenges are here ->");
  issues.forEach((issue, index) => {
    // For each issue, get team and issuePoints and search in dic (2) if the issue owner already exist:
    const team = issue.labels
      .filter((label) => label.name.includes("team:"))[0]
      .name.split(":")[1];
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

    const submissionDate = issue.created_at;

    console.log("CHALLENGE ID", challengeId, "User Submission", submissionDate);

    const currentChallenge = challenges.find(
      (challenge) => challenge.id === challengeId
    );

    const bonusPoints = getChallengeBonus(currentChallenge, submissionDate);
    console.log("BONUS POINTS", bonusPoints, "ISSUESP POINTS", issuesPoints);
    const totalPoints = issuesPoints + bonusPoints;

    console.log("TOTAL POINTS ", bonusPoints);

    /**  
      if user not exist:
      -> then
      ---- we add a new entry at dict two [userLookupTable] (2) user: issuesPoints
      ---- we add a new entry at dic one [pointsAndUsers] (1) using the issuesPoints to find the spot // END
    */
    let userFoundInLookupTable = true;
    if (!userLookupTable[user]) {
      userLookupTable[user] = totalPoints;
      pointsAndUsers[totalPoints] = [user];
      //return;
      userFoundInLookupTable = false;
    }
    console.log("Checkpoint 1");
    /**  
      if team not exist:
      -> then
      ---- we add a new entry at dict two [teamLookupTable] (2) team: issuesPoints
      ---- we add a new entry at dic one [pointsAndTeams] (1) using the issuesPoints to find the spot // END
    */
    let teamFoundInLookupTable = true;
    if (!teamLookupTable[team]) {
      teamLookupTable[team] = totalPoints;
      pointsAndTeams[totalPoints] = [team];
      //return;
      teamFoundInLookupTable = false;
    }
    console.log("Checkpoint 2");
    /**
       if user exist:
      -> then 
      ---- remove the user from his current position at dic one [pointsAndUsers] (1) and delete the key if value is empty -> []
      ---- get new user points
      ---- add new entry (or update the current one) using the new user points to the dic one [pointsAndUsers] (1)
      ---- update the user current points at dict two [userLookupTable] (2) // END
    */

    if (userFoundInLookupTable) {
      const userCurrentPoints = userLookupTable[user];
      const usersXRewardIndex = pointsAndUsers[userCurrentPoints].indexOf(user);

      pointsAndUsers[userCurrentPoints].splice(usersXRewardIndex, 1);

      // if the points X is empty (no user at it) with delete that entry
      if (pointsAndUsers[userCurrentPoints].length === 0)
        delete pointsAndUsers[userCurrentPoints];

      const newReward = userCurrentPoints + totalPoints;

      pointsAndUsers[newReward] = [...(pointsAndUsers[newReward] ?? []), user];
      userLookupTable[user] = newReward;
    }
    console.log("Checkpoint 3");

    /**
       if team exist:
      -> then 
      ---- remove the user from his current position at dic one [pointsAndTeams] (1) and delete the key if value is empty -> []
      ---- get new user points
      ---- add new entry (or update the current one) using the new user points to the dic one [pointsAndTeams] (1)
      ---- update the team current points at dict two [teamLookupTable] (2) // END
    */
    if (teamFoundInLookupTable) {
      const teamCurrentPoints = teamLookupTable[user];
      const teamXRewardIndex = pointsAndTeams[teamCurrentPoints].indexOf(user);

      pointsAndTeams[teamCurrentPoints].splice(teamXRewardIndex, 1);

      // if the points X is empty (no user at it) with delete that entry
      if (pointsAndTeams[teamCurrentPoints].length === 0)
        delete pointsAndTeams[teamCurrentPoints];

      const newReward = teamCurrentPoints + totalPoints;

      pointsAndTeams[newReward] = [...(pointsAndTeams[newReward] ?? []), user];
      teamLookupTable[user] = newReward;
    }
    console.log("Checkpoint 4");

    return;
  });

  let leaderboardJsonString = {
    users: null,
    teams: null,
  };
  // FOR USERS now, we create the single leaderboard, using the dict one (1)
  const sortedUsersLeaderboardKeys = Object.keys(pointsAndUsers).sort(
    (a, b) => Number(b) - Number(a)
  );
  const usersLeaderBoard = [];
  sortedUsersLeaderboardKeys.forEach((points) => {
    pointsAndUsers[points].forEach((user) => {
      usersLeaderBoard.push({
        user,
        points: Number(points),
      });
    });
  });

  leaderboardJsonString.users = JSON.stringify(usersLeaderBoard);

  // FOR TEAMS now, we create the single leaderboard, using the dict one (1)
  const sortedTeamsLeaderboardKeys = Object.keys(pointsAndTeams).sort(
    (a, b) => Number(b) - Number(a)
  );
  const teamsLeaderBoard = [];
  sortedTeamsLeaderboardKeys.forEach((points) => {
    pointsAndTeams[points].forEach((team) => {
      teamsLeaderBoard.push({
        team,
        points: Number(points),
      });
    });
  });

  leaderboardJsonString.teams = JSON.stringify(teamsLeaderBoard);

  return JSON.stringify(leaderboardJsonString);
};

async function run() {
  try {
    console.log("Entering github action");
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
    const leaderboardJsonString = await getChallengesLeaderboards(issues);

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
    core.setFailed("QUE PASO??", error);
  }
}

run();

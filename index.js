const core = require("@actions/core");
const octokit = require("octokit");
const fetch = require("cross-fetch");

const TIME_REWARD_PERCENTAGE = 20;
const GITHUB_APP_ID = core.getInput("github-app-id");
const GITHUB_PRIVATE_KEY = core.getInput("github-private-key");
const GITHUB_APP_INSTALLATION = core.getInput("github-app-installation");
const GITHUB_OWNER = core.getInput("github-owner");
const GITHUB_REPO = core.getInput("github-repo");
const CHALLENGES_API_URL = core.getInput("challenge-api");

const authenticateGithubApp = async () => {
  const app = new octokit.App({
    appId: GITHUB_APP_ID,
    privateKey: JSON.parse(GITHUB_PRIVATE_KEY),
  });
  const octokitApp = await app.getInstallationOctokit(GITHUB_APP_INSTALLATION);

  return octokitApp.rest;
};

const getChallenges = async () => {
  const challenges = await fetch(
    CHALLENGES_API_URL
  );

  const data = await challenges.json();

  return data;
};

const getProgress = (min, max, value) => {
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

const getIssuesPagingUpgrade = async (restApi, labels) => {
  let response = null;
  const per_page = 100;
  const paginated_data = [];
  const MAX_PAGES = 10;
  let i = 1;

  for (i; i < MAX_PAGES; i++) {
    console.log("Page ", i);
    response = await restApi.issues.listForRepo({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      labels: labels,
      page: i,
      per_page: 100,
    });

    if (response.data === null || response.data.length === 0) {
      break;
    }

    paginated_data.push(...response.data);
  }

  if (paginated_data.length == 0) {
    console.log(response);
    console.log(`i got nuthn for you..`);
    return [];
  }

  const issues = paginated_data;

  if (!issues.length) {
    return null;
  }
  return issues.reverse();
};

const getAllTeamsIssues = async (restApi) => {
  const teams = await restApi.issues.listForRepo({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    labels: `team`,
    state: "open",
  });

  return teams.data;
};

const getChallengesLeaderboards = async (restApi, issues) => {
  // Create two dic one [pointsAndUsers] (1) `points: [user]` and the other dict two [userLookupTable] (2) `user: currentPoint` (LookUp Table)
  const pointsAndUsers = {};
  const userLookupTable = {};
  // Create two dic one [pointsAndTeams] (1) `points: [team]` and the other dict two [teamLookupTable] (2) `team: currentPoint` (LookUp Table)
  // const pointsAndTeams = {};
  // const teamLookupTable = {};

  const challenges = await getChallenges();
  issues.forEach((issue, index) => {
    // For each issue, get team and issuePoints and search in dic (2) if the issue owner already exist:
    // const teamLabel = issue.labels.filter((label) =>
    //   label.name.includes("team:")
    // );

    // for get aonly new kind of issues (all issues have now a team label, if not, skip)
    // if (teamLabel.length === 0) return;

    // const team = teamLabel[0].name.split(":")[1];
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
    const currentChallenge = challenges.find(
      (challenge) => challenge.id === challengeId
    );
    const bonusPoints = getChallengeBonus(currentChallenge, submissionDate);
    const totalPoints = issuesPoints + bonusPoints;
      
    /**  
      if user not exist:
      -> then

      ---- we add a new entry at dict two [userLookupTable] (2) user: issuesPoints
      ---- we add a new entry at dic one [pointsAndUsers] (1) using the issuesPoints to find the spot // END
    */
    let userFoundInLookupTable = true;
    if (!userLookupTable[user]) {
      userLookupTable[user] = totalPoints;
      pointsAndUsers[totalPoints] = [...(pointsAndUsers[totalPoints] ?? []), user];
      //return;
      userFoundInLookupTable = false;
    }

    /**  
      if team not exist:
      -> then
      ---- we add a new entry at dict two [teamLookupTable] (2) team: issuesPoints
      ---- we add a new entry at dic one [pointsAndTeams] (1) using the issuesPoints to find the spot // END
    */
    // let teamFoundInLookupTable = true;
    // if (!teamLookupTable[team]) {
    //   teamLookupTable[team] = totalPoints;
    //   pointsAndTeams[totalPoints] = [team];
    //   //return;
    //   teamFoundInLookupTable = false;
    // }

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

      // remove the current user from the key it belongs
      pointsAndUsers[userCurrentPoints].splice(usersXRewardIndex, 1);

      // if the points X is empty (no user at it) with delete that entry
      if (pointsAndUsers[userCurrentPoints].length === 0)
        delete pointsAndUsers[userCurrentPoints];

      // getting new reward, adding the bonus points to the issues points
      const newReward = userCurrentPoints + totalPoints;

      pointsAndUsers[newReward] = [...(pointsAndUsers[newReward] ?? []), user];
      userLookupTable[user] = newReward;
    }

    /**
       if team exist:
      -> then 
      ---- remove the team from his current position at dic one [pointsAndTeams] (1) and delete the key if value is empty -> []
      ---- get new team points
      ---- add new entry (or update the current one) using the new team points to the dic one [pointsAndTeams] (1)
      ---- update the team current points at dict two [teamLookupTable] (2) // END
    */
    // if (teamFoundInLookupTable) {
    //   const teamCurrentPoints = teamLookupTable[team];
    //   const teamXRewardIndex = pointsAndTeams[teamCurrentPoints].indexOf(team);

    //   pointsAndTeams[teamCurrentPoints].splice(teamXRewardIndex, 1);

    //   // if the points X is empty (no team at it) with delete that entry
    //   if (pointsAndTeams[teamCurrentPoints].length === 0)
    //     delete pointsAndTeams[teamCurrentPoints];

    //   const newReward = teamCurrentPoints + totalPoints;

    //   pointsAndTeams[newReward] = [...(pointsAndTeams[newReward] ?? []), team];
    //   teamLookupTable[team] = newReward;
    // }
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

  leaderboardJsonString.users = usersLeaderBoard;
  leaderboardJsonString.teams = null;

  // const teams = await getAllTeamsIssues(restApi);

  // FOR TEAMS now, we create the single leaderboard, using the dict one (1)
  // const sortedTeamsLeaderboardKeys = Object.keys(pointsAndTeams).sort(
  //   (a, b) => Number(b) - Number(a)
  // );
  // const teamsLeaderBoard = [];
  // sortedTeamsLeaderboardKeys.forEach((points) => {
  //   pointsAndTeams[points].forEach((teamNumber) => {
  //     const temp_team = teams.filter((team) => {
  //       return Number(team.number) === Number(teamNumber);
  //     });

  //     teamsLeaderBoard.push({
  //       team: temp_team[0]?.title,
  //       points: Number(points),
  //     });
  //   });
  // });

  // leaderboardJsonString.teams = teamsLeaderBoard;

  return JSON.stringify(leaderboardJsonString);
};

async function run() {
  try {
    console.log("Entering github action !!! 1");
    console.log("testing");
    console.log({GITHUB_APP_ID,GITHUB_PRIVATE_KEY,GITHUB_APP_INSTALLATION,GITHUB_OWNER,GITHUB_REPO,CHALLENGES_API_URL})
    const restApi = await authenticateGithubApp();

    const issues = await getIssuesPagingUpgrade(restApi, "challenge,completed");
    console.log("NUMBER OF ISSUES", issues.length, issues);
    const leaderboardJsonString = await getChallengesLeaderboards(
      restApi,
      issues
    );

    const leaderboardsIssue = await restApi.issues.listForRepo({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      labels: `core:leaderboard`,
      state: "open",
    });

    if (leaderboardsIssue.data.length > 0) {
      await restApi.issues.update({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        issue_number: leaderboardsIssue.data[0].number,
        body: leaderboardJsonString,
      });
    } else {
      await restApi.issues.create({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        title: "Current Leaderboard",
        body: leaderboardJsonString,
        labels: [`core:leaderboard`],
      });
    }

    console.log("JSON -->", leaderboardJsonString);
  } catch (error) {
    core.setFailed("QUE PASO??", error);
  }
}

run();

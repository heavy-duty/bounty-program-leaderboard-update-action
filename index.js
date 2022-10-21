const core = require("@actions/core");
const github = require("@actions/github");

try {
  // `who-to-greet` input defined in action metadata file
  console.log("Welcome to the github-action");
} catch (error) {
  core.setFailed(error.message);
}

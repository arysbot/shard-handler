const ShardOrchestrator = require("./src/oldStuff/ShardOrchestrator");
// check the env variables
const requiredEnv = require("@arys/required-env");

const orchestrator = new ShardOrchestrator();

const foo = {};

foo.orchestrator = orchestrator;

const ShardOrchestrator = require("./src/ShardOrchestrator");

const orchestrator = new ShardOrchestrator();

const foo = {};

foo.orchestrator = orchestrator;

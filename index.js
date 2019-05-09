const ShardOrchestrator = require("./src/ShardOrchestrator");
// check the env variables
const requiredEnv = require("@arys/required-env");
const raven = require("raven");

switch(process.env.NODE_ENV) {
    case "dev": {
        try {
            const orchestrator = new ShardOrchestrator();
        } catch(e) {
            console.error(e);
        }
        break;
    }
    case "prod": {
        raven.config(process.env.SENTRY_URL).install();
        raven.context(function () {
            const orchestrator = new ShardOrchestrator();
        });

    }
}

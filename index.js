const ShardOrchestrator = require("./src/ShardOrchestrator");
const raven = require("raven");

switch(process.env.NODE_ENV) {
    case "dev": {
        try {
            const requiredEnv = require("@arys/required-env");
            const orchestrator = new ShardOrchestrator();
        } catch(e) {
            console.error(e);
        }
        break;
    }
    case "prod": {
        console.log(process.env);
        raven.config(process.env.SENTRY_URL).install();
        raven.context(function () {
            const requiredEnv = require("@arys/required-env");
            const orchestrator = new ShardOrchestrator();
        });

    }
}

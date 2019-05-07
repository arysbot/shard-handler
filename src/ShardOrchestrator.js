const GrpcClient = require("@arys/grpc-client");
const grpcUrl = require("@arys/grpc-url");
const grpc = require("grpc");
const redis = require("redis");
const Logger = require("@arys/logger");
const snekfetch = require("snekfetch");
const uuidGenerator = require("uuid/v1");
const k8s = require("kubernetes-client");
const ws = require("ws");

class ShardOrchestrator {
    constructor() {
        this.constants = {
            REDIS_PORT: parseInt(process.env.REDIS_PORT),
            ORCHESTRATOR_WS_PORT: parseInt(process.env.ORCHESTRATOR_WS_PORT),
            DISCORD_TOKEN: process.env.DISCORD_TOKEN,
            SHARDS_PER_SHARDER: parseInt(process.env.SHARDS_PER_SHARDER),
            TIME_BETWEEN_SHARD_COUNT: parseInt(process.env.TIME_BETWEEN_SHARD_COUNT),
            SCALING_FACTOR: parseInt(process.env.SCALING_FACTOR),
            WEBSOCKET_RESTART_CLIENT_TIMEOUT: parseInt(process.env.WEBSOCKET_RESTART_CLIENT_TIMEOUT),
            NODE_ENV: process.env.NODE_ENV
        };
        // clients:
        // logger
        // redis
        // kubernetes

        // ws server


        // async context
        (async () => {
            // start logger
            this.logger = new Logger({ service: "shard-orchestrator" });
            // start the k8 client
            this.k8 = new k8s.Client({ config: k8s.config.getInCluster() });
            await this.k8.loadSpec();
            // start ws server
            this.ws = new ws.Server({ port: this.constants.ORCHESTRATOR_WS_PORT });
            this.clientsCount = 0;
            // start redis
            this.redis = redis.createClient(grpcUrl("redis"), this.constants.REDIS_PORT);
            this.redis.once("connect", async () => {
                // assign an id to each sharder so that we can talk to them individually
                this.ws.on("connect", (client) => {
                    client.send(this.clientsCount);
                    this.clientsCount++;
                });
                this.wantedShardCount = await this.getShards();
                // check for the shard count on redis and all the shards connected to the websocket after WEBSOCKET_RESTART_CLIENT_TIMEOUT secs
                // if the amount of shard wanted is bellow the threshold of 1.25 time the amount of shard connected, we don't rescale on start
                const suposedlyConnectedShards = this.redis.get("shards");
                const actuallyConnectedShards = [];
                // if we hit the suposedlyConnectedShards with the sharders connected to the socket, we'll send a
                // message to all of these sharders to double check that one of them did not get downed for some reason
                this.ws.on("message", (message) => {
                    try {
                        message = JSON.stringify(message);
                        // codes:
                        // 1: sharder asking for shards
                        // 2: sharder reconnecting to orchestrator with already assigned shards
                        switch(message.code) {
                            case 1: {
                                break;
                            }
                            case 2: {

                                break;
                            }
                        }
                    } catch(e) {

                    }
                });
            });
        })();
    }

    async getShards() {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            snekfetch.get(`https://discordapp.com/api/v7/gateway/bot`)
                .set("Authorization", `Bot ${this.constants.DISCORD_TOKEN}`)
                .end(async (err, res) => {
                    const endTimestamp = Date.now();
                    const latency = endTimestamp - timestamp;
                    if(err) {
                        await this.logger.logRequest("DiscordAPI#getShards",
                            uuidGenerator(),
                            err.body.message,
                            latency);
                        process.exit(1);
                    } else {
                        this.logger.logRequest("DiscordAPI#getShards", uuidGenerator(),
                            `${res.statusCode} ${res.statusText}`, latency);
                        resolve(parseInt(res.body.shards));
                    }
                });
        });
    }
}

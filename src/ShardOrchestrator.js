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
            // REDIS_PORT: parseInt(process.env.REDIS_PORT),
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
        // start logger
        try {
            this.init();
        } catch(e) {
            throw e;
        }
    }

    async init() {
        this.startLogger();
        this.wantedShardCount = await this.getShards();
        this.wantedSharderCount = Math.ceil(this.wantedShardCount / this.constants.SHARDS_PER_SHARDER);
        //await this.startRedis();
        await this.startKubernetes();
        await this.startWebSocket();
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

    startLogger() {
        this.logger = new Logger({ service: "shard-orchestrator" });
    }

    async startKubernetes() {
        this.k8 = new k8s.Client({ config: k8s.config.getInCluster() });
        await this.k8.loadSpec();
        await this.rescaleKubernetesDeployment(this.wantedSharderCount);
        this.checkDeploymentScale();
        return this.k8;
    }

    checkDeploymentScale() {
        const loop = () => {
            setTimeout(async () => {
                const newShards = await this.getShards();
                if(Math.round(this.shards * this.constants.SCALING_FACTOR) <= newShards) {
                    this.rescale();
                }
                loop();
            }, this.constants.TIME_BETWEEN_SHARD_COUNT);
        };
        loop();
    }

    rescaleKubernetesDeployment(sharders) {
        return this.k8.apis.apps.v1
            .namespaces(`arys-${this.constants.NODE_ENV}`)
            .deployments("sharder")
            .patch({ body: { spec: { replicas: sharders } } });
    }

    async startRedis() {
        console.log(grpcUrl("redis"));
        this.redis = redis.createClient(grpcUrl("redis"), this.constants.REDIS_PORT);
        await this.waitRedisConnection();
        return this.redis;
    }

    async startWebSocket() {
        // TODO: do redis stuff
        this.availableShards = [];
        for(let i = 0; i < this.wantedShardCount; i++) {
            this.availableShards.push(i);
        }
        this.ws = new ws.Server({ port: this.constants.ORCHESTRATOR_WS_PORT });
        this.sharderCount = 0;
        this.sharders = new Map();
        // assign an id to each sharder so that we can talk to them individually
        this.ws.on("connect", (client) => {
            client.send(this.sharderCount);
            this.sharders.set(this.sharderCount, {
                shards: [],
                hostname: ""
            });
            this.sharderCount++;
        });
        this.ws.on("message", (message) => {
            try {
                message = JSON.stringify(message);
            } catch(e) {
                throw e;
            }
            // codes:
            // 1: sharder asking for shards
            // 2: sharder reconnecting to orchestrator with already assigned shards
            // 3: sharder receiving shards
            switch(message.code) {
                case 1: {
                    const sharder = this.sharders.get(message.sharderId);
                    sharder.hostname = message.hostname;
                    sharder.shards = this.assignShards();
                    message.client.send(JSON.stringify({
                        code: 3,
                        shards: sharder.shards,
                        totalShards: this.wantedShardCount
                    }));
                }
            }
        });
        return this.ws;
    }

    assignShards() {
        const availableShards = this.availableShards.length;
        const limit = this.constants.SHARDS_PER_SHARDER < availableShards ?
            this.constants.SHARDS_PER_SHARDER : availableShards;
        const assignedShards = [];
        for(let i = 0; i < limit; i++) {
            assignedShards.push(this.availableShards.pop());
        }
        return assignedShards;
    }

    waitRedisConnection() {
        return new Promise((resolve, reject) => {
            this.redis.once("connect", () => {
                resolve();
            });
        });
    }
}

module.exports = ShardOrchestrator;

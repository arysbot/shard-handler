const GrpcClient = require("@arys/grpc-client");
const grpcUrl = require("@arys/grpc-url");
const grpc = require("grpc");
const redis = require("redis");
const Logger = require("@arys/logger");
const snekfetch = require("snekfetch");
const _uuid = require("uuid/v1");
const k8s = require("kubernetes-client");
const GuildRegulator = require("./GuildRegulator");

class ShardOrchestrator {
    constructor() {
        this.constants = {
            REDIS_PORT: parseInt(process.env.REDIS_PORT),
            DISCORD_TOKEN: process.env.DISCORD_TOKEN,
            SHARDS_PER_SHARDER: parseInt(process.env.SHARDS_PER_SHARDER),
            TIME_BETWEEN_SHARD_COUNT: parseInt(process.env.TIME_BETWEEN_SHARD_COUNT),
            SCALING_FACTOR: parseInt(process.env.SCALING_FACTOR),
            NODE_ENV: process.env.NODE_ENV
        };
        try {
            this.init();
        } catch(err) {
            throw err;
        }
    }

    async init() {
        // start the logger
        this.logger = new Logger({ service: "shard-orchestrator" });
        // start the k8 client
        this.k8 = new k8s.Client({ config: k8s.config.getInCluster() });
        await this.k8.loadSpec();
        // connect to redis
        this.redis = redis.createClient(grpcUrl("redis"), this.constants.REDIS_PORT);
        this.redis.once("connect", async () => {

            // get number of recommended shards and check that we get a coherent value
            this.shards = await this.getShards();
            if(isNaN(this.shards) || typeof this.shards !== "number" || this.shards === 0) {
                throw new Error(`did not receive a good shard amount from discord\nValue: ${this.shards}`);
            }
            // only executed if we get a right value
            // create the array that contains the shard that needs to get distributed
            this.availableShards = [];
            for(let i = 0; i < this.shards; i++) {
                this.availableShards[i] = i;
            }
            this.sharderMap = new Map();
            // actually start the shard orchestrator
            // start the grpc client
            this.grpcClient = new GrpcClient();
            // start the grpc server
            this.grpcServer = new grpc.Server();
            // bind the handlers for the grpc requests
            this.grpcServer.addService(this.grpcClient.proto.shardOrchestrator.service, {
                Identify: this.identifyClient,
                UpdateGuildAmount: this.updateGuildAmount
            });
            console.log(this);
            // system to check if we need to reboot with more shards
            this.guildRegulator = new GuildRegulator();
        });
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
                        await this.logger.logRequest("DiscordAPI#getShards", _uuid(), err.body.message, latency);
                        process.exit(1);
                    }
                    this.logger.logRequest("DiscordAPI#getShards", _uuid(),
                        `${res.statusCode} ${res.statusText}`, latency);
                    resolve(parseInt(res.body.shards));
                });
        });
    }

    // receive the request from the sharder to assign it shards
    identifyClient(ctx, callback) {
        const { request } = ctx;
        const { uuid } = request;
        const shards = this.assignShards(uuid);
        const response = {
            uuid,
            shards,
            errorCode: 0,
            lastGuildRefresh: this.guildRegulator.lastGuildRefresh
        };
        callback(null, response); // sendUnaryData(error, value [, trailer] [, flags])
    }

    assignShards(uuid) {
        // TODO: push info to redis
        const usedShards = [];
        for(let i = 0; i < this.constants.SHARDS_PER_SHARDER; i++) {
            usedShards.push(this.availableShards.shift());
        }
        this.sharderMap.set(uuid, usedShards);
        this.redis.rpush("sharderMap", usedShards);
        return usedShards;
    }

    scaleCheck() {
        setTimeout(async () => {
            const newShards = await this.getShards();
            if(Math.round(this.shards * this.constants.SCALING_FACTOR) <= newShards) {
                this.rescale();
            }
        }, this.constants.TIME_BETWEEN_SHARD_COUNT);
    }

    rescale(sharders) {
        return this.k8.apis.apps.v1
            .namespaces(`arys-${this.constants.NODE_ENV}`)
            .deployments("sharder")
            .patch({ body: { spec: { replicas: sharders } } });
    }
}

module.exports = ShardOrchestrator;

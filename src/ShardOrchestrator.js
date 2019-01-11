const GrpcClient = require("@arys/grpc-client");
const grpcUrl = require("@arys/grpc-url");
const grpc = require("grpc");
const Logger = require("@arys/logger");
const snekfetch = require("snekfetch");
const _uuid = require("uuid/v1");
const k8s = require("@kubernetes/client-node");
const GuildRegulator = require("GuildRegulator");

class ShardOrchestrator {
    constructor() {
        try {
            this.init();
        } catch(err) {
            throw err;
        }
    }
    async init() {
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
        console.log(this.grpcClient.proto);
        // start the grpc server
        this.grpcServer = new grpc.Server();
        // bind the handlers for the grpc requests
        this.grpcServer.addService(this.grpcClient.proto.shardOrchestrator.service, {
            Identify: this.identifyClient,
            UpdateGuildAmount: this.updateGuildAmount
        });
        // start the logger
        this.logger = new Logger({ service: "shard-orchestrator" });
        // system to check if we need to reboot with more shards
        this.guildRegulator = new GuildRegulator();
    }
    async getShards() {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            snekfetch.get(`https://discordapp.com/api/v7/gateway/bot`)
                .set("Authorization", `Bot ${process.env.DISCORD_TOKEN}`)
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
    identifyClient(ctx, callback) {
        const { request } = ctx;
        const { uuid } = request;
        const shards = this.assignShards(uuid);
        const response = {
            uuid,
            shards,
            errorCode: 0,


        };
        callback(null, response); // sendUnaryData(error, value [, trailer] [, flags])
    }
    assignShards(uuid) {
        // TODO: push info to redis
        const usedShards = [];
        for(let i = 0; i < process.env.SHARD_PER_POD; i++) {
            usedShards.push(this.availableShards.shift());
        }
        this.sharderMap.set(uuid, usedShards);
        return usedShards;
    }
    updateGuildAmount(ctx, callback) {
        const { request } = ctx;

    }
}

module.exports = ShardOrchestrator;

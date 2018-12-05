const GrpcClient = require("@arys/grpc-client");
const KubernetesClient = require("kubernetes-client").Client;
const Logger = require("@arys/logger");
const snekfetch = require("snekfetch");
const _uuid = require("uuid/v1");

class ShardOrchestrator {
    constructor() {
        (async () => {
            this.grpcClient = new GrpcClient();
            this.logger = new Logger({ service: "shard-orchestrator" });
            await this.identify();
        })();
    }
    async startKubernetes() {
        this.kubernetes = {};
        this.kubernetes.config = require("kubernetes-client").config;
        this.kubernetes.client = new KubernetesClient({ config: this.kubernetes.config.getInCluster() });
        await this.kubernetes.client.loadSpec();
    }
    async identify() {
        this.shards = await this.getShards();
    }
    async getShards() {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            snekfetch.get(`https://discordapp.com/api/v7/gateway/bot`)
                .set("Authorization", `Bot ${process.env.DISCORD_TOKEN}`)
                .end((err, res) => {
                    const endTimestamp = Date.now();
                    const latency = endTimestamp - timestamp;
                    if(err) {
                        this.logger.logRequest("getShards", _uuid(), err.body.message, latency);
                        resolve(err);
                    }
                    this.logger.logRequest("getShards", _uuid(), `${res.statusCode} ${res.statusText}`, latency);
                    resolve(res.body.shards);
                });
        });
    }
}


module.exports = ShardOrchestrator;

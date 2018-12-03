const GrpcClient = require("@arys/grpc-client");
const KubernetesClient = require('kubernetes-client').Client
const Logger = require("@arys/logger");
const snekfetch = require("snekfetch");
const _uuid = require("uuid/v1");

process.env.DISCORD_TOKEN = "MzA2NTIzMjM2Mjg2NDY0MDEx.Dua3pw.bMq3IoXmUThfvNEu3wJtA-LtHjk";

class ShardOrchestrator {
    constructor() {
        (async () => {
            this.grpcClient = new GrpcClient();
            this.logger = new Logger({ service: "shard-orchestrator" });
            this.kubernetes = {};
            this.kubernetes.config = require('kubernetes-client').config;
            this.kubernetes.client = new KubernetesClient({ config: this.kubernetes.config.getInCluster() });
            await client.loadSpec()
        })();
    }
    async identify() {
        const shards = await this.getShards();
    }
    async getShards() {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            snekfetch.get(`https://discordapp.com/api/v7/gateway/bot`)
                .set('Authorization', `Bot ${process.env.DISCORD_TOKEN}`)
                .end((err, res) => {
                    if (err) reject(err);
                    const endTimestamp = Date.now();
                    const latency = endTimestamp - timestamp;
                    this.logger.logRequest("getShards", _uuid(), { code: 200 }, latency);
                    resolve(res.body.shards);
                });
        });
    }
}

new ShardOrchestrator();

module.exposts = ShardOrchestrator;

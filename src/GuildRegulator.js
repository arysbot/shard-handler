class GuildRegulator {
    constructor(config) {
        // this is created right after the orchestrator pulls the shard amount from discord
        this.shards = config.shards;
        this.lastGuildRefresh = Date.now();
        this.TIME_BETWEEN_GUILDCOUNT = parseInt(process.env.TIME_BETWEEN_GUILDCOUNT);
        setTimeout(() => {
            this.lastGuildRefresh += this.TIME_BETWEEN_GUILDCOUNT;
        }, this.TIME_BETWEEN_GUILDCOUNT);
        this.shardMap = new Map();
    }
    updateMap(shard, guildAmount) {
        this.shardMap.set(shard, guildAmount);
    }
    countGuilds() {
        this.guildCount = 0;
        this.shardMap.forEach((shard, guildCount) => {
            this.guildCount += guildCount;
        });
    }
}
module.exports = GuildRegulator;

// T007: JSON file storage service for players.json and config.json
import { promises as fs } from "fs";
import { join } from "path";
import { PlayersData, ConfigData, Player, LogProcessingState } from "./types";

export class StorageService {
  private readonly playersFile = join(process.cwd(), "players.json");
  private readonly configFile = join(process.cwd(), "config.json");

  // Player data management
  async loadPlayers(): Promise<PlayersData> {
    try {
      const data = await fs.readFile(this.playersFile, "utf-8");
      const parsed = JSON.parse(data) as PlayersData;

      // Convert date strings back to Date objects
      Object.values(parsed.players).forEach((player) => {
        player.firstSeen = new Date(player.firstSeen);
        player.lastUpdated = new Date(player.lastUpdated);
        if (player.lastDeathTimestamp) {
          player.lastDeathTimestamp = new Date(player.lastDeathTimestamp);
        }
      });

      return parsed;
    } catch (error) {
      // Return empty structure if file doesn't exist or is invalid
      return {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        players: {},
      };
    }
  }

  async savePlayers(data: PlayersData): Promise<void> {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(
      this.playersFile,
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  }

  async updatePlayer(
    username: string,
    updates: Partial<Player>
  ): Promise<void> {
    const data = await this.loadPlayers();

    if (!data.players[username]) {
      data.players[username] = {
        username,
        totalDeaths: 0,
        lastDeathTimestamp: null,
        firstSeen: new Date(),
        lastUpdated: new Date(),
      };
    }

    data.players[username] = {
      ...data.players[username],
      ...updates,
      lastUpdated: new Date(),
    };

    await this.savePlayers(data);
  }

  async getPlayer(username: string): Promise<Player | null> {
    const data = await this.loadPlayers();
    return data.players[username] || null;
  }

  // Configuration management
  async loadConfig(): Promise<ConfigData | null> {
    try {
      const data = await fs.readFile(this.configFile, "utf-8");
      return JSON.parse(data) as ConfigData;
    } catch (error) {
      return null;
    }
  }

  async saveConfig(config: ConfigData): Promise<void> {
    await fs.writeFile(
      this.configFile,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  // Log processing state management
  async getLogState(): Promise<LogProcessingState | null> {
    try {
      const config = await this.loadConfig();
      return config?.logState || null;
    } catch (error) {
      return null;
    }
  }

  async saveLogState(state: LogProcessingState): Promise<void> {
    try {
      let config = await this.loadConfig();
      if (!config) {
        // Create minimal config if it doesn't exist
        config = {
          discord: { channelId: "", guildId: "", enabled: true },
        };
      }

      config.logState = state;
      await this.saveConfig(config);
    } catch (error) {
      console.error("Failed to save log state:", error);
    }
  }

  // Utility methods
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    try {
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      // Backup creation is optional, don't fail the operation
      console.warn(`Failed to create backup for ${filePath}:`, error);
    }
  }
}

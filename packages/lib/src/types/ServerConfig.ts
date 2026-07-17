import AutomodSettings from "./antispam/AutomodSettings";
import LogConfig from "./LogConfig";

class ServerConfig {
	id: string;
	prefix?: string;
	spaceAfterPrefix?: boolean;
	automodSettings?: AutomodSettings;
	antispamEnabled?: boolean; // Used by private spam detection module
	botManagers?: string[];
	moderators?: string[];
	votekick?: {
		enabled?: boolean;
		kickEnabled?: boolean;
		kickVotesRequired: number;
		kickVoteDuration: number;
		banEnabled?: boolean;
		banVotesRequired: number;
		banVoteDuration: number;
		banDuration: number; // 0 = permanent, >0 = temp ban in minutes
		timeoutEnabled?: boolean;
		timeoutVotesRequired: number;
		timeoutVoteDuration: number;
		timeoutDuration: number; // timeout duration in minutes
		trustedRoles: string[];
	};
	whitelist?: {
		users?: string[];
		roles?: string[];
		managers?: boolean;
	};
	logs?: {
		messageUpdate?: LogConfig; // Message edited or deleted
		modAction?: LogConfig; // User warned, kicked or banned
	};
	dmOnKick?: boolean; // Whether users should receive a DM when kicked. Default false
	dmOnBan?: boolean; // Whether users should receive a DM when banned. Default false
	dmOnWarn?: boolean; // Whether users should receive a DM when warned. Default false

	// TODO: rename this and write a migration for it (this is why you don't code when sleep deprived)
	discoverAutospamNotify?: boolean; // Whether we have notified the server owner that antispam is enabled for servers on discover.

	wordlistEnabled?: boolean;
	wordlistAction?: {
		action: "LOG" | "DELETE" | "WARN";
		message: string;
	};
	wordlist?: { word: string; strictness: "SOFT" | "HARD" | "STRICT" }[];
}

export default ServerConfig;

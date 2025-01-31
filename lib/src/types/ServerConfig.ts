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
		enabled: boolean;
		votesRequired: number;
		banDuration: number; // -1: Only kick, 0: Permanent, >0: Ban duration in minutes
		trustedRoles: string[];
	};
	linkedServer?: string;
	whitelist?: {
		users?: string[];
		roles?: string[];
		managers?: boolean;
	};
	logs?: {
		messageUpdate?: LogConfig; // Message edited or deleted
		modAction?: LogConfig; // User warned, kicked or banned
	};
	allowBlacklistedUsers?: boolean; // Whether the server explicitly allows users that are globally blacklisted
	dmOnKick?: boolean; // Whether users should receive a DM when kicked/banned. Default false
	dmOnWarn?: boolean; // Whether users should receive a DM when warned. Default false
	contact?: string; // How to contact the server staff. Sent on kick/ban/warn DMs. http(s)/mailto link or normal text.

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

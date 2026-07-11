export interface ClientOptions {
	baseURL: string;
	autoReconnect: boolean;
	heartbeatInterval?: number;
	pongTimeout?: number;
	connectTimeout?: number;
	debug?: boolean;
	readyFields?: string[];
}

/** The bot/user session token */
export type Session = string;

/** Server configuration returned by GET / */
export interface RevoltConfig {
	ws: string;
	app: string;
	vapid: string;
	features: {
		autumn: {
			url: string;
			enabled: boolean;
		};
		january: {
			url: string;
			enabled: boolean;
		};
		voso: {
			url: string;
			enabled: boolean;
			ws: string;
		};
	};
	build: {
		commit_sha: string;
		commit_timestamp: string;
		semver: string;
		origin_url: string;
		timestamp: string;
	};
}

/** Raw user data from the API */
export interface RawUser {
	_id: string;
	username: string;
	discriminator?: string;
	displayName?: string;
	avatar?: RawFile;
	badges?: number;
	status?: { text?: string; presence?: string };
	online?: boolean;
	privileged?: boolean;
	flags?: number;
	bot?: { owner: string };
	relationship?: string;
}

/** Raw server data from the API */
export interface RawServer {
	_id: string;
	ownerId?: string; // _id of owner
	owner?: string; // sometimes "owner"
	name: string;
	description?: string;
	icon?: RawFile;
	banner?: RawFile;
	channelIds?: string[];
	channels?: string[];
	categories?: RawCategory[];
	systemMessages?: Record<string, string>;
	roles?: Record<string, RawRole>;
	defaultPermissions?: bigint | number;
	flags?: number;
	analytics?: boolean;
	discoverable?: boolean;
	nsfw?: boolean;
}

/** Raw channel data from the API */
export interface RawChannel {
	_id: string;
	channelType?: string;
	type?: string;
	name?: string;
	description?: string;
	icon?: RawFile;
	active?: boolean;
	serverId?: string;
	server?: string;
	userId?: string;
	ownerId?: string;
	recipientIds?: string[];
	recipients?: string[];
	permissions?: bigint;
	defaultPermissions?: { a?: bigint; d?: bigint } | number;
	rolePermissions?: Record<string, { a?: bigint; d?: bigint }>;
	nsfw?: boolean;
	lastMessageId?: string;
	voice?: any;
}

/** Raw server member data */
export interface RawServerMember {
	_id: { server: string; user: string };
	joinedAt?: string;
	joined_at?: string;
	nickname?: string;
	avatar?: RawFile;
	roles?: string[];
	timeout?: string;
}

/** Raw message data */
export interface RawMessage {
	_id: string;
	nonce?: string;
	channelId?: string;
	channel?: string;
	authorId?: string;
	author?: string;
	webhook?: RawWebhook;
	content?: string;
	systemMessage?: RawSystemMessage;
	system?: RawSystemMessage;
	attachments?: RawAttachment[];
	editedAt?: string;
	edited?: string;
	embeds?: any[];
	mentionIds?: string[];
	mentions?: string[];
	roleMentionIds?: string[];
	replyIds?: string[];
	replies?: string[];
	reactions?: Record<string, string[]>;
	interactions?: RawInteractions;
	masquerade?: RawMasquerade;
	flags?: number;
	pinned?: boolean;
	member?: RawServerMember;
	user?: RawUser;
}

/** Raw file/attachment data */
export interface RawFile {
	_id: string;
	tag: string;
	filename?: string;
	metadata: {
		type: string;
		width?: number;
		height?: number;
	};
	size?: number;
}

/** Raw attachment */
export interface RawAttachment {
	id: string;
	tag: string;
	filename?: string;
	size?: number;
	metadata?: {
		type: string;
		width?: number;
		height?: number;
	};
}

/** Raw webhook */
export interface RawWebhook {
	id?: string;
	name: string;
	avatar?: RawFile;
	avatarURL?: string;
}

/** Raw system message */
export interface RawSystemMessage {
	type: string;
	userId?: string;
	id?: string;
	by?: string;
	content?: string;
}

/** Raw interactions */
export interface RawInteractions {
	reactions?: string[];
	restrict_reactions?: boolean;
}

/** Raw masquerade */
export interface RawMasquerade {
	name?: string;
	colour?: string;
	color?: string;
	avatar?: string;
}

/** Raw role */
export interface RawRole {
	name: string;
	rank?: number;
	colour?: string;
	color?: string;
	hoist?: boolean;
	permissions?: { a?: bigint; d?: bigint };
}

/** Raw category */
export interface RawCategory {
	id: string;
	title: string;
	channels: string[];
}

/** Server ban */
export interface ServerBan {
	id: { user: string; server: string };
	_id?: { user: string; server: string };
	reason?: string;
	user?: RawUser;
}

/** Ban list result */
export interface BanListResult {
	users: RawUser[];
	bans: ServerBan[];
}

/** All member response */
export interface AllMemberResponse {
	members: RawServerMember[];
	users: RawUser[];
}

export interface SendableEmbed {
	title?: string;
	description?: string;
	colour?: string;
	color?: string;
	icon_url?: string;
	url?: string;
	fields?: { title: string; content: string }[];
	image?: { url: string };
}

/** Message send data */
export interface DataMessageSend {
	content?: string;
	embeds?: SendableEmbed[];
	replies?: { id: string; mention: boolean }[];
	attachments?: string[];
	interactions?: RawInteractions;
	masquerade?: RawMasquerade;
	nonce?: string;
	flags?: number;
}

/** Message edit data */
export interface DataEditMessage {
	content?: string;
	embeds?: SendableEmbed[];
}

/** Data for editing a member */
export interface DataMemberEdit {
	roles?: string[];
	nickname?: string;
	avatar?: string;
	timeout?: string;
	remove?: string[];
}

/** Data for banning */
export interface DataBanCreate {
	reason?: string;
	timeout?: number;
}

/** Connection state enum */
export enum ConnectionState {
	Idle = 0,
	Connecting = 1,
	Connected = 2,
	Disconnected = 3,
}

/** User system message types */
export type UserSystemMessageType = "user_kicked" | "user_banned" | "user_joined" | "user_left";

/** User presence type */
export type Presence = "Online" | "Idle" | "Busy" | "Invisible" | "Focus";

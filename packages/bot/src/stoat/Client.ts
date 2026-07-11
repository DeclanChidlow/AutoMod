import { EventEmitter } from "events";
import { API } from "./rest";
import { EventClient } from "./ws";
import { ConnectionState, ClientOptions, RevoltConfig } from "./types";
import { UserCollection } from "./collections/UserCollection";
import { ServerCollection } from "./collections/ServerCollection";
import { ChannelCollection } from "./collections/ChannelCollection";
import { ServerMemberCollection } from "./collections/ServerMemberCollection";
import { MessageCollection } from "./collections/MessageCollection";
import { User } from "./structures/User";

export { ClientOptions };

export class Client extends EventEmitter {
	users: UserCollection;
	servers: ServerCollection;
	channels: ChannelCollection;
	serverMembers: ServerMemberCollection;
	messages: MessageCollection;
	api: API;
	options: ClientOptions;
	events: EventClient;
	configuration: RevoltConfig | undefined;
	user!: User;
	ready: boolean = false;

	private _session: string | undefined;
	private _reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
	private _connectionFailureCount: number = 0;

	constructor(options: Partial<ClientOptions> = {}, configuration?: RevoltConfig) {
		super();
		// Suppress MaxListeners warnings. Many modules listen on the same events
		this.setMaxListeners(100);
		this.options = {
			baseURL: options.baseURL || "https://stoat.chat/api",
			autoReconnect: options.autoReconnect ?? true,
			heartbeatInterval: options.heartbeatInterval ?? 30,
			pongTimeout: options.pongTimeout ?? 10,
			connectTimeout: options.connectTimeout ?? 15,
			debug: options.debug ?? false,
			readyFields: options.readyFields,
		};
		this.configuration = configuration;
		this.api = new API({ baseURL: this.options.baseURL });
		this.users = new UserCollection(this);
		this.servers = new ServerCollection(this);
		this.channels = new ChannelCollection(this);
		this.serverMembers = new ServerMemberCollection(this);
		this.messages = new MessageCollection(this);
		this.events = new EventClient(1, "json", {
			heartbeatInterval: this.options.heartbeatInterval,
			pongTimeout: this.options.pongTimeout,
			connectTimeout: this.options.connectTimeout,
			autoReconnect: this.options.autoReconnect,
			debug: this.options.debug,
		});

		this.events.on("error", (error) => this.emit("error", error));
		this.events.on("state", (state: ConnectionState) => {
			switch (state) {
				case ConnectionState.Connected:
					this._connectionFailureCount = 0;
					this.emit("connected");
					break;
				case ConnectionState.Connecting:
					this.emit("connecting");
					break;
				case ConnectionState.Disconnected:
					this.emit("disconnected");
					if (this.options.autoReconnect) {
						const delay = Math.min(1000 * Math.pow(2, this._connectionFailureCount), 30_000);
						this._connectionFailureCount++;
						this._reconnectTimeout = setTimeout(() => this.connect(), delay);
					}
					break;
			}
		});

		this.events.on("event", (event: any) => this._handleEvent(event));
	}

	private async _fetchConfiguration(): Promise<void> {
		if (!this.configuration) {
			this.configuration = await this.api.get("/");
		}
	}

	connect(): void {
		clearTimeout(this._reconnectTimeout);
		this.events.disconnect();
		this.ready = false;

		if (!this._session) {
			console.error("Cannot connect: no session token");
			return;
		}

		const wsUrl = this.configuration?.ws;
		if (!wsUrl) {
			throw new Error("No WebSocket URL in server config — fetch configuration first");
		}

		console.info(`Connecting to WebSocket: ${wsUrl}`);
		this.events.connect(wsUrl, this._session, this.options.readyFields);
	}

	async loginBot(token: string): Promise<void> {
		await this._fetchConfiguration();
		this._session = token;
		this.api = new API({ baseURL: this.options.baseURL, authentication: { revolt: token } });
		this.connect();
	}

	private _handleEvent(event: any): void {
		switch (event.type) {
			case "Bulk": {
				for (const item of event.v) this._handleEvent(item);
				break;
			}
			case "Ready": {
				if (event.users)
					for (const user of event.users) {
						const u = this.users.getOrCreate(user._id, user);
						if (user.relationship === "User") this.user = u;
					}
				if (event.servers) for (const server of event.servers) this.servers.getOrCreate(server._id, server);
				if (event.channels) for (const channel of event.channels) this.channels.getOrCreate(channel._id, channel);
				if (event.members) for (const member of event.members) this.serverMembers.getOrCreate(member._id, member);
				// If users were not included in Ready (because we used ?ready= to slim the payload),
				// fetch the bot's own user via REST so this.user is set before we emit 'ready'.
				if (!this.user) {
					this.api.get("/users/@me").then((me: any) => {
						this.user = this.users.getOrCreate(me._id, me);
					}).catch((e: any) => {
						console.error("Failed to fetch bot user via REST:", e?.message || e);
					});
				}
				this.ready = true;
				this.emit("ready");
				break;
			}
			case "Message": {
				if (event.member) this.serverMembers.getOrCreate(event.member._id, event.member);
				if (event.user) this.users.getOrCreate(event.user._id, event.user);
				const msgData = { ...event };
				delete msgData.member;
				delete msgData.user;
				if (msgData.channel && !msgData.channelId) msgData.channelId = msgData.channel;
				const message = this.messages.getOrCreate(msgData._id, msgData, true);
				const channelId = event.channel || event.channelId;
				if (channelId) this.channels.updateUnderlyingObject(channelId, "lastMessageId", event._id);
				this.emit("messageCreate", message);
				break;
			}
			case "MessageUpdate": {
				const existing = this.messages.get(event.id);
				if (existing) {
					const previous = { ...this.messages.getUnderlyingObject(event.id), channelId: event.channel };
					this.messages.updateUnderlyingObject(event.id, { ...event.data, editedAt: new Date().toISOString() });
					this.emit("messageUpdate", existing, previous);
				}
				break;
			}
			case "MessageDelete": {
				if (this.messages.get(event.id)) {
					this.emit("messageDelete", this.messages.getUnderlyingObject(event.id));
					this.messages.delete(event.id);
				}
				break;
			}
			case "BulkMessageDelete": {
				const deleted: any[] = [];
				if (event.ids)
					for (const id of event.ids) {
						if (this.messages.get(id)) {
							deleted.push(this.messages.getUnderlyingObject(id));
							this.messages.delete(id);
						}
					}
				this.emit("messageDeleteBulk", deleted, event.channel ? this.channels.get(event.channel) : undefined);
				break;
			}
			case "MessageReact": {
				const msg = this.messages.get(event.id);
				if (msg) {
					const reactions = this.messages.getUnderlyingObject(event.id).reactions || {};
					if (!reactions[event.emoji_id]) reactions[event.emoji_id] = [];
					if (!reactions[event.emoji_id].includes(event.user_id)) reactions[event.emoji_id].push(event.user_id);
					this.messages.updateUnderlyingObject(event.id, "reactions", reactions);
					this.emit("messageReactionAdd", msg, event.user_id, event.emoji_id);
				}
				break;
			}
			case "MessageUnreact": {
				const msg = this.messages.get(event.id);
				if (msg) {
					const reactions = this.messages.getUnderlyingObject(event.id).reactions || {};
					if (reactions[event.emoji_id]) {
						reactions[event.emoji_id] = reactions[event.emoji_id].filter((uid: string) => uid !== event.user_id);
						if (reactions[event.emoji_id].length === 0) delete reactions[event.emoji_id];
					}
					this.messages.updateUnderlyingObject(event.id, "reactions", reactions);
					this.emit("messageReactionRemove", msg, event.user_id, event.emoji_id);
				}
				break;
			}
			case "ChannelCreate": {
				if (!this.channels.has(event._id)) this.channels.getOrCreate(event._id, event, true);
				break;
			}
			case "ChannelUpdate": {
				const channel = this.channels.get(event.id);
				if (channel && event.data) {
					const previous = { ...this.channels.getUnderlyingObject(event.id) };
					this.channels.updateUnderlyingObject(event.id, event.data);
					this.emit("channelUpdate", channel, previous);
				}
				break;
			}
			case "ChannelDelete": {
				if (this.channels.get(event.id)) {
					this.emit("channelDelete", this.channels.getUnderlyingObject(event.id));
					this.channels.delete(event.id);
				}
				break;
			}
			case "ServerCreate": {
				const data = event.server || event;
				if (!this.servers.has(data._id)) {
					if (event.channels) for (const ch of event.channels) this.channels.getOrCreate(ch._id, ch);
					this.servers.getOrCreate(data._id, data, true);
				}
				break;
			}
			case "ServerUpdate": {
				const server = this.servers.get(event.id);
				if (server && event.data) {
					const previous = { ...this.servers.getUnderlyingObject(event.id) };
					this.servers.updateUnderlyingObject(event.id, event.data);
					this.emit("serverUpdate", server, previous);
				}
				break;
			}
			case "ServerDelete": {
				if (this.servers.get(event.id)) {
					const data = this.servers.getUnderlyingObject(event.id);
					for (const cid of data.channelIds ?? data.channels ?? []) this.channels.delete(cid);
					this.emit("serverDelete", data);
					this.servers.delete(event.id);
				}
				break;
			}
			case "ServerMemberJoin": {
				const id = { server: event.id, user: event.user };
				if (!this.serverMembers.hasByKey(id)) {
					this.emit("serverMemberJoin", this.serverMembers.getOrCreate(id, { _id: id, joined_at: new Date().toISOString() }));
				}
				break;
			}
			case "ServerMemberUpdate": {
				const member = this.serverMembers.getByKey(event.id);
				if (member && event.data) {
					const key = event.id.server + event.id.user;
					const previous = { ...this.serverMembers.getUnderlyingObject(key) };
					this.serverMembers.updateUnderlyingObject(key, event.data);
					this.emit("serverMemberUpdate", member, previous);
				}
				break;
			}
			case "ServerMemberLeave": {
				if (event.user === this.user?.id) {
					this._handleEvent({ type: "ServerDelete", id: event.id });
					return;
				}
				const key = event.id + event.user;
				if (this.serverMembers.hasByKey({ server: event.id, user: event.user })) {
					this.emit("serverMemberLeave", this.serverMembers.getUnderlyingObject(key));
					this.serverMembers.delete(key);
				}
				break;
			}
			case "ServerRoleUpdate": {
				const server = this.servers.get(event.id);
				if (server) {
					const roles = { ...(this.servers.getUnderlyingObject(event.id).roles || {}) };
					roles[event.role_id] = { ...(roles[event.role_id] || {}), ...event.data };
					this.servers.updateUnderlyingObject(event.id, "roles", roles);
				}
				break;
			}
			case "ServerRoleDelete": {
				const server = this.servers.get(event.id);
				if (server) {
					const roles = { ...(this.servers.getUnderlyingObject(event.id).roles || {}) };
					delete roles[event.role_id];
					this.servers.updateUnderlyingObject(event.id, "roles", roles);
				}
				break;
			}
			case "UserUpdate": {
				const user = this.users.get(event.id);
				if (user && event.data) {
					const previous = { ...this.users.getUnderlyingObject(event.id) };
					this.users.updateUnderlyingObject(event.id, event.data);
					this.emit("userUpdate", user, previous);
				}
				break;
			}
			case "UserPresence": {
				this.users.updateUnderlyingObject(event.id, "online", event.online);
				break;
			}
			case "UserRelationship": {
				if (event.user) this.users.updateUnderlyingObject(event.user._id, event.user);
				break;
			}
			case "ChannelGroupJoin": {
				const channel: any = this.channels.get(event.id);
				if (channel && event.user) {
					const rids: string[] = [...(channel.recipientIds as Set<string>)];
					if (!rids.includes(event.user)) rids.push(event.user);
					this.channels.updateUnderlyingObject(event.id, "recipientIds", rids);
				}
				break;
			}
			case "ChannelGroupLeave": {
				const channel: any = this.channels.get(event.id);
				if (channel && event.user) {
					const ids: string[] = [...(channel.recipientIds as Set<string>)];
					this.channels.updateUnderlyingObject(
						event.id,
						"recipientIds",
						ids.filter((id: string) => id !== event.user),
					);
				}
				break;
			}
		}
	}
}

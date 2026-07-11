import { decodeTime } from "ulid";
import { SystemMessage } from "./SystemMessage";

export class Message {
	private collection: any;
	id: string;

	constructor(collection: any, id: string) {
		this.collection = collection;
		this.id = id;
	}

	private get client(): any {
		return this.collection.client;
	}
	private get data(): any {
		return this.collection.getUnderlyingObject(this.id) || {};
	}

	get createdAt() {
		return new Date(decodeTime(this.id));
	}
	get nonce() {
		return this.data.nonce;
	}
	get channelId(): string {
		return this.data.channelId ?? this.data.channel ?? "";
	}
	get channel() {
		const cid = this.channelId;
		return cid ? this.client.channels.get(cid) : undefined;
	}
	get server() {
		return this.channel?.server;
	}
	get member() {
		const sid = this.channel?.serverId;
		if (!sid) return undefined;
		return this.client.serverMembers.getByKey({ server: sid, user: this.authorId });
	}
	get authorId(): string {
		return this.data.authorId ?? this.data.author ?? "";
	}
	get author() {
		const aid = this.authorId;
		return aid ? this.client.users.get(aid) : undefined;
	}
	get webhook() {
		return this.data.webhook;
	}
	get content() {
		return this.data.content;
	}
	get systemMessage() {
		const sm = this.data.systemMessage ?? this.data.system;
		return sm ? new SystemMessage(sm) : undefined;
	}
	get attachments() {
		const atts = this.data.attachments;
		if (!atts) return undefined;
		return atts.map((a: any) => ({ id: a.id ?? a._id, tag: a.tag, filename: a.filename, size: a.size, metadata: a.metadata }));
	}
	get editedAt() {
		const ts = this.data.editedAt ?? this.data.edited;
		return ts ? new Date(ts) : undefined;
	}
	get embeds() {
		return this.data.embeds;
	}
	get replyIds() {
		return this.data.replyIds ?? this.data.replies;
	}
	get reactions() {
		const r = this.data.reactions || {};
		const map = new Map<string, Set<string>>();
		for (const [key, value] of Object.entries(r)) map.set(key, new Set(value as string[]));
		return map;
	}
	get interactions() {
		return this.data.interactions;
	}
	get masquerade() {
		const m = this.data.masquerade;
		if (!m) return undefined;
		return { name: m.name, colour: m.colour ?? m.color, avatar: m.avatar };
	}
	get flags() {
		return this.data.flags ?? 0;
	}
	get avatarURL() {
		if (this.masquerade?.avatar) {
			const january = this.client.configuration?.features?.january;
			return january?.enabled ? `${january.url}/proxy?url=${encodeURIComponent(this.masquerade.avatar)}` : this.masquerade.avatar;
		}
		return this.webhook?.avatarURL ?? this.member?.avatarURL ?? this.author?.avatarURL;
	}
	get url() {
		const app = this.client.configuration?.app ?? "";
		return `${app}${this.channel?.path ?? ""}/${this.id}`;
	}

	async edit(data: any) {
		const payload = typeof data === "string" ? { content: data } : data;
		return await this.client.api.patch(`/channels/${this.channelId}/messages/${this.id}`, payload);
	}

	async delete() {
		return await this.client.api.delete(`/channels/${this.channelId}/messages/${this.id}`);
	}

	async reply(data: any, mention: boolean = true) {
		const obj: any = typeof data === "string" ? { content: data } : { ...data };
		obj.replies = [{ id: this.id, mention }];
		return this.channel?.sendMessage(obj);
	}
}

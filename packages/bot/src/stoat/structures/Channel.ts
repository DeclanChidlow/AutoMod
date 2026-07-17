import { decodeTime, ulid } from "ulid";
import { File } from "./File";
import { bitwiseAndEq, Permission } from "../permissions";

export class Channel {
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
	get type() {
		return this.data.channelType ?? this.data.type ?? this.data.channel_type;
	}
	get name() {
		return this.data.name;
	}
	get displayName() {
		if (this.type === "DirectMessage") return this.recipient?.username;
		return this.name;
	}
	get recipientIds(): Set<string> {
		return new Set(this.data.recipientIds ?? this.data.recipients ?? []);
	}
	get recipient() {
		if (this.type !== "DirectMessage") return undefined;
		return [...this.recipientIds].map((id) => this.client.users.get(id)).find((u: any) => u?.id !== this.client.user?.id);
	}
	get serverId(): string | undefined {
		return this.data.serverId ?? this.data.server;
	}
	get server(): any {
		const sid = this.serverId;
		return sid ? this.client.servers.get(sid) : undefined;
	}
	get path() {
		return this.serverId ? `/server/${this.serverId}/channel/${this.id}` : `/channel/${this.id}`;
	}
	get iconURL() {
		return this.icon?.createFileURL() ?? this.recipient?.avatarURL;
	}
	get active() {
		return this.data.active ?? true;
	}

	private get icon() {
		const i = this.data.icon;
		return i ? new File(this.client, i) : undefined;
	}

	get permission() {
		if (!this.client.user) return 0n;
		const server = this.server;
		if (server && this.client.user.id === server.ownerId) return (1n << 64n) - 1n;
		let perms = server ? server.permission : 0n;
		const dp = this.data.defaultPermissions;
		if (dp) {
			perms |= BigInt(typeof dp === "number" ? 0n : (dp.a ?? 0n));
			perms &= ~BigInt(typeof dp === "number" ? BigInt(dp) : (dp.d ?? 0n));
		}
		if (server && this.data.rolePermissions) {
			const member = server.member;
			const roles = member?.roles ?? [];
			for (const roleId of roles) {
				const rp = this.data.rolePermissions[roleId];
				if (rp) {
					perms |= BigInt(rp.a ?? 0n);
					perms &= ~BigInt(rp.d ?? 0n);
				}
			}
		}
		return perms;
	}

	havePermission(...permission: string[]) {
		return bitwiseAndEq(this.permission, ...permission.map((x) => (Permission as any)[x]));
	}

	async sendMessage(data: any, idempotencyKey?: string) {
		const msg: any = typeof data === "string" ? { content: data } : { ...data };
		if (typeof msg.content === "string" && msg.content.startsWith("@silent ")) {
			msg.content = msg.content.substring(8);
			msg.flags = (msg.flags ?? 0) | 1;
		}
		const message = await this.client.api.post(`/channels/${this.id}/messages`, msg, {
			headers: { "Idempotency-Key": idempotencyKey || ulid() },
		});
		return this.client.messages.getOrCreate(message._id, message, true);
	}

	async fetchMessage(messageId: string) {
		const data = await this.client.api.get(`/channels/${this.id}/messages/${messageId}`);
		return this.client.messages.getOrCreate(data._id, data);
	}

	async fetchMessages(params?: any) {
		const data = await this.client.api.get(`/channels/${this.id}/messages`, params || {});
		const messages = Array.isArray(data) ? data : (data.messages ?? []);
		return messages.map((msg: any) => this.client.messages.getOrCreate(msg._id, msg));
	}

	async delete(leaveSilently?: boolean) {
		await this.client.api.delete(`/channels/${this.id}`, { leave_silently: leaveSilently });
		if (this.type === "DirectMessage") {
			this.collection.updateUnderlyingObject(this.id, "active", false);
			return;
		}
		this.collection.delete(this.id);
	}

	toString() {
		return `<#${this.id}>`;
	}
}

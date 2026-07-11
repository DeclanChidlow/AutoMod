import { decodeTime } from "ulid";
import { File } from "./File";
import { bitwiseAndEq, Permission } from "../permissions";

export class Server {
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
	get ownerId() {
		return this.data.ownerId ?? this.data.owner;
	}
	get owner() {
		const oid = this.ownerId;
		return oid ? this.client.users.get(oid) : undefined;
	}
	get name() {
		return this.data.name;
	}
	get description() {
		return this.data.description;
	}
	get icon() {
		const i = this.data.icon;
		return i ? new File(this.client, i) : undefined;
	}
	get banner() {
		const b = this.data.banner;
		return b ? new File(this.client, b) : undefined;
	}
	get channelIds() {
		return this.data.channelIds ?? this.data.channels ?? [];
	}
	get channels() {
		return this.channelIds.map((id: string) => this.client.channels.get(id)).filter((x: any) => x);
	}
	get systemMessages() {
		return this.data.systemMessages;
	}
	get roles() {
		const r = this.data.roles;
		if (!r) return undefined;
		const map = new Map<string, any>();
		for (const [key, value] of Object.entries(r)) map.set(key, value);
		return map;
	}
	get defaultPermissions() {
		return this.data.defaultPermissions ?? 0n;
	}
	get discoverable() {
		return this.data.discoverable;
	}
	get iconURL() {
		return this.icon?.createFileURL();
	}
	get bannerURL() {
		return this.banner?.createFileURL();
	}

	get member() {
		if (!this.client.user) return undefined;
		return this.client.serverMembers.getByKey({ server: this.id, user: this.client.user.id });
	}

	get permission() {
		if (!this.member) return 0n;
		if (this.ownerId && this.client.user?.id === this.ownerId) return (1n << 64n) - 1n;
		let perms = BigInt(this.defaultPermissions ?? 0);
		const memberRoles = this.member?.roles ?? [];
		const roles = this.roles;
		if (roles) {
			for (const roleId of memberRoles) {
				const role = roles.get(roleId);
				if (role?.permissions) {
					perms |= BigInt(role.permissions.a ?? 0n);
					perms &= ~BigInt(role.permissions.d ?? 0n);
				}
			}
		}
		return perms;
	}

	havePermission(...permission: string[]) {
		return bitwiseAndEq(this.permission, ...permission.map((x) => (Permission as any)[x]));
	}

	async banUser(user: any, options: any = {}) {
		const userId = typeof user === "string" ? user : (user.id?.user ?? user.id ?? user);
		return await this.client.api.put(`/servers/${this.id}/bans/${userId}`, options);
	}

	async kickUser(user: any) {
		const userId = typeof user === "string" ? user : (user.id?.user ?? user.id ?? user);
		return await this.client.api.delete(`/servers/${this.id}/members/${userId}`);
	}

	async unbanUser(user: any) {
		const userId = typeof user === "string" ? user : (user.id ?? user);
		return await this.client.api.delete(`/servers/${this.id}/bans/${userId}`);
	}

	async fetchBans() {
		const result: any = await this.client.api.get(`/servers/${this.id}/bans`);
		return result.bans.map((ban: any) => ({
			...ban,
			id: ban._id || ban.id,
			user: result.users?.find((u: any) => u._id === (ban._id?.user || ban.id?.user)),
		}));
	}

	async fetchMember(user: any) {
		const userId = typeof user === "string" ? user : user.id;
		const existing = this.client.serverMembers.getByKey({ server: this.id, user: userId });
		if (existing) return existing;
		return this.client.serverMembers.fetch(this.id, userId);
	}

	async fetchMembers() {
		const data: any = await this.client.api.get(`/servers/${this.id}/members`);
		for (const user of data.users) this.client.users.getOrCreate(user._id, user);
		for (const member of data.members) this.client.serverMembers.getOrCreate(member._id, member);
		return data;
	}
}

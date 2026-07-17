import { File } from "./File";
import { bitwiseAndEq, Permission } from "../permissions";

export class ServerMember {
	private collection: any;
	id: { server: string; user: string };

	constructor(collection: any, id: { server: string; user: string }) {
		this.collection = collection;
		this.id = id;
	}

	private get client(): any {
		return this.collection.client;
	}
	private get data(): any {
		return this.collection.getUnderlyingObject(this.id.server + this.id.user) || {};
	}

	get user() {
		return this.client.users.get(this.id.user);
	}
	get server() {
		return this.client.servers.get(this.id.server);
	}
	get nickname() {
		return this.data.nickname;
	}
	get avatar() {
		const a = this.data.avatar;
		return a ? new File(this.client, a) : undefined;
	}
	get roles(): string[] {
		return this.data.roles ?? [];
	}
	get joinedAt() {
		const raw = this.data.joinedAt ?? this.data.joined_at;
		return raw ? new Date(raw) : undefined;
	}
	get displayName() {
		return this.nickname ?? this.user?.displayName;
	}
	get avatarURL() {
		return this.avatar?.createFileURL() ?? this.user?.avatarURL;
	}

	get roleColour() {
		const ordered = this.orderedRoles;
		const coloured = ordered.filter((x: any) => x.colour || x.color);
		return coloured.length > 0 ? (coloured[coloured.length - 1].colour ?? coloured[coloured.length - 1].color) : null;
	}

	get ranking() {
		if (this.id.user === this.server?.ownerId) return -Infinity;
		const roles = this.orderedRoles;
		if (roles.length > 0) return roles[roles.length - 1].rank ?? Infinity;
		return Infinity;
	}

	private get orderedRoles() {
		const server = this.server;
		if (!server) return [];
		return this.roles?.map((id: string) => ({ id, ...(server.roles?.get(id) || {}) })).sort((a: any, b: any) => (b.rank ?? 0) - (a.rank ?? 0)) ?? [];
	}

	hasPermission(target: any, ...permission: string[]) {
		// Server owner always has all permissions
		const server = target.serverId ? target.server : target;
		if (server && this.id.user === server.ownerId) {
			return bitwiseAndEq((1n << 64n) - 1n, ...permission.map((x) => (Permission as any)[x]));
		}

		let perms = 0n;

		if (target.serverId) {
			// target is a Channel: compute server-level perms for THIS member, then apply channel overrides
			if (server) {
				perms = BigInt(server.defaultPermissions ?? 0);
				const serverRoles = server.roles;
				if (serverRoles) {
					for (const roleId of this.roles ?? []) {
						const role = serverRoles.get(roleId);
						if (role?.permissions) {
							perms |= BigInt(role.permissions.a ?? 0n);
							perms &= ~BigInt(role.permissions.d ?? 0n);
						}
					}
				}
			}
			// Apply channel-level overrides
			const dp = target.data?.defaultPermissions;
			if (dp) {
				perms |= BigInt(typeof dp === "number" ? 0n : (dp.a ?? 0n));
				perms &= ~BigInt(typeof dp === "number" ? BigInt(dp) : (dp.d ?? 0n));
			}
			if (server && target.data?.rolePermissions) {
				for (const roleId of this.roles ?? []) {
					const rp = target.data.rolePermissions[roleId];
					if (rp) {
						perms |= BigInt(rp.a ?? 0n);
						perms &= ~BigInt(rp.d ?? 0n);
					}
				}
			}
		} else {
			// target is a Server: compute server-level perms for THIS member
			perms = BigInt(target.defaultPermissions ?? 0);
			const roles = target.roles;
			if (roles) {
				for (const roleId of this.roles ?? []) {
					const role = roles.get(roleId);
					if (role?.permissions) {
						perms |= BigInt(role.permissions.a ?? 0n);
						perms &= ~BigInt(role.permissions.d ?? 0n);
					}
				}
			}
		}

		return bitwiseAndEq(perms, ...permission.map((x) => (Permission as any)[x]));
	}

	inferiorTo(target: any) {
		return target.ranking < this.ranking;
	}

	async edit(data: any) {
		await this.client.api.patch(`/servers/${this.id.server}/members/${this.id.user}`, data);
	}

	toString() {
		return `<@${this.id.user}>`;
	}
}

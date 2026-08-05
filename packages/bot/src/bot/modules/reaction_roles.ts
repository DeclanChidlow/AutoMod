import { client, dbs } from "../../index";
import { getOwnMemberInServer } from "../util";

const normalizeEmoji = (emoji: string) => {
	return emoji.replace(/^:([A-Z0-9]+):$/i, "$1").replace(/[️︎]/g, "");
};

/**
 * Try to notify a user via DM that their reaction role could not be applied.
 * Swallows errors as we don't want notification failures to become unhandled rejections.
 */
async function notifyUser(userId: string, message: string) {
	try {
		const user = client.users.get(userId);
		if (!user) return;
		const dm = await user.openDM();
		if (dm) await dm.sendMessage({ content: message });
	} catch (_) {
		// DM could not be delivered (user has DMs closed, etc). Nothing AutoMod can do. :(
	}
}

function isNotElevated(error: any): boolean {
	if (error?.type === "NotElevated") return true;
	if (error?.message?.includes("NotElevated")) return true;
	if (typeof error === "string" && error.includes("NotElevated")) return true;
	return false;
}

client.on("messageReactionAdd", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	let reactionRole: any;
	let server: any;

	try {
		const normalizedEmoji = normalizeEmoji(emoji);

		reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		server = client.servers.get(reactionRole.server);
		if (!server) return;

		// Verify the role still exists on the server.
		if (!server.roles?.get(reactionRole.roleId)) {
			console.warn(`[ReactionRoles] Role ${reactionRole.roleId} no longer exists in server ${server.id}; removing orphaned entry`);
			await dbs.REACTION_ROLES.deleteOne({ _id: reactionRole._id }).catch(() => {});
			return;
		}

		// Always fetch fresh member data from the API to avoid stale-cache races.
		const member = await server.fetchMemberFresh(user);
		if (!member) return;

		const currentRoles = member.roles || [];

		if (!currentRoles.includes(reactionRole.roleId)) {
			const role = server.roles?.get(reactionRole.roleId);
			const botMember = await getOwnMemberInServer(server);

			if (!member.inferiorTo(botMember)) {
				notifyUser(user, `AutoMod cannot assign roles to you because your highest role is above AutoMod's role in the hierarchy. A server admin must move AutoMod's role higher.`).catch(() => {});
				return;
			}

			if (role?.rank != null && role.rank <= botMember.ranking) {
				notifyUser(
					user,
					`AutoMod cannot assign the role \`${role.name || reactionRole.roleId}\` because it is above AutoMod's own role in the permission hierarchy. A server admin must move AutoMod's role higher.`,
				).catch(() => {});
				return;
			}

			if (!server.havePermission("AssignRoles")) {
				notifyUser(user, `AutoMod lacks permission to assign roles in this server. A server admin must grant the bot permission.`).catch(() => {});
				return;
			}

			await member.edit({ roles: [...currentRoles, reactionRole.roleId] });
		}
	} catch (e: any) {
		console.error("Failed to process reaction role add:", e);
		const message = isNotElevated(e)
			? `AutoMod cannot assign the role \`${server.roles?.get(reactionRole.roleId)?.name || reactionRole.roleId}\` because it is above AutoMod's role in the hierarchy. A server admin must move AutoMod's role higher.`
			: "Unable to assign your reaction role. Please contact a server admin.";
		notifyUser(user, message).catch(() => {});
	}
});

client.on("messageReactionRemove", async (message, user, emoji) => {
	if (user === client.user?.id) return;

	let reactionRole: any;
	let server: any;

	try {
		const normalizedEmoji = normalizeEmoji(emoji);

		reactionRole = await dbs.REACTION_ROLES.findOne({ messageId: message.id, emoji: normalizedEmoji });
		if (!reactionRole) return;

		server = client.servers.get(reactionRole.server);
		if (!server) return;

		// Verify the role still exists on the server.
		if (!server.roles?.get(reactionRole.roleId)) {
			console.warn(`[ReactionRoles] Role ${reactionRole.roleId} no longer exists in server ${server.id}; removing orphaned entry`);
			await dbs.REACTION_ROLES.deleteOne({ _id: reactionRole._id }).catch(() => {});
			return;
		}

		// Fetch fresh data, then send the full roles array minus the removed role.
		const member = await server.fetchMemberFresh(user);
		if (!member) return;

		const currentRoles = member.roles || [];
		if (currentRoles.includes(reactionRole.roleId)) {
			const role = server.roles?.get(reactionRole.roleId);
			const botMember = await getOwnMemberInServer(server);

			if (!member.inferiorTo(botMember)) {
				notifyUser(
					user,
					`AutoMod cannot remove roles from you because your highest role is above AutoMod's role in the hierarchy. A server admin must move AutoMod's role higher or remove your role manually.`,
				).catch(() => {});
				return;
			}

			if (role?.rank != null && role.rank <= botMember.ranking) {
				notifyUser(
					user,
					`AutoMod cannot remove the role \`${role.name || reactionRole.roleId}\` because it is above AutoMod's own role in the hierarchy. A server admin must move AutoMod's role higher or remove your role manually.`,
				).catch(() => {});
				return;
			}

			if (!server.havePermission("AssignRoles")) {
				notifyUser(user, `AutoMod lacks permission to assign roles in this server. A server admin must grant the bot permission.`).catch(() => {});
				return;
			}

			await member.edit({ roles: currentRoles.filter((role) => role !== reactionRole.roleId) });
		}
	} catch (e: any) {
		console.error("Failed to process reaction role remove:", e);
		const message = isNotElevated(e)
			? `AutoMod cannot remove the role \`${server.roles?.get(reactionRole.roleId)?.name || reactionRole.roleId}\` because it is above AutoMod's role in the hierarchy. A server admin must move AutoMod's role higher.`
			: "Unable to remove your reaction role. Please contact a server admin.";
		notifyUser(user, message).catch(() => {});
	}
});

// Clean up orphaned reaction role entries when a role is deleted from a server.
client.on("serverRoleDelete", async (server, roleId) => {
	try {
		const result = await dbs.REACTION_ROLES.deleteMany({ server: server.id, roleId });
		if (result.deletedCount > 0) {
			console.info(`[ReactionRoles] Cleaned up ${result.deletedCount} orphaned reaction role(s) for deleted role ${roleId} in server ${server.id}`);
		}
	} catch (e) {
		console.error("Failed to clean up orphaned reaction roles:", e);
	}
});

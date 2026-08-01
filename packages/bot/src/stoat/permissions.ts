/**
 * Permission bitfield constants matching the official Stoat API specification.
 * @see https://github.com/stoatchat/javascript-client-sdk/blob/main/src/permissions/definitions.ts
 */

export const U32_MAX = 2 ** 32 - 1;

export const UserPermission = {
	Access: 1 << 0,
	ViewProfile: 1 << 1,
	SendMessage: 1 << 2,
	Invite: 1 << 3,
} as const;

export const Permission = {
	ManageChannel: 2n ** 0n,
	ManageServer: 2n ** 1n,
	ManagePermissions: 2n ** 2n,
	ManageRole: 2n ** 3n,
	ManageCustomisation: 2n ** 4n,

	KickMembers: 2n ** 6n,
	BanMembers: 2n ** 7n,
	TimeoutMembers: 2n ** 8n,
	AssignRoles: 2n ** 9n,
	ChangeNickname: 2n ** 10n,
	ManageNicknames: 2n ** 11n,
	ChangeAvatar: 2n ** 12n,
	RemoveAvatars: 2n ** 13n,

	ViewChannel: 2n ** 20n,
	ReadMessageHistory: 2n ** 21n,
	SendMessage: 2n ** 22n,
	ManageMessages: 2n ** 23n,
	ManageWebhooks: 2n ** 24n,
	InviteOthers: 2n ** 25n,
	SendEmbeds: 2n ** 26n,
	UploadFiles: 2n ** 27n,
	Masquerade: 2n ** 28n,
	React: 2n ** 29n,

	Connect: 2n ** 30n,
	Speak: 2n ** 31n,
	Video: 2n ** 32n,
	MuteMembers: 2n ** 33n,
	DeafenMembers: 2n ** 34n,
	MoveMembers: 2n ** 35n,
	Listen: 2n ** 36n,

	MentionEveryone: 2n ** 37n,
	MentionRoles: 2n ** 38n,

	BypassSlowmode: 2n ** 39n,

	GrantAllSafe: 0x000f_ffff_ffff_ffffn,
} as const;

export const ALLOW_IN_TIMEOUT =
	Permission.ViewChannel + Permission.ReadMessageHistory;

export const DEFAULT_PERMISSION_VIEW_ONLY =
	Permission.ViewChannel + Permission.ReadMessageHistory;

export const DEFAULT_PERMISSION =
	DEFAULT_PERMISSION_VIEW_ONLY +
	Permission.SendMessage +
	Permission.InviteOthers +
	Permission.SendEmbeds +
	Permission.UploadFiles +
	Permission.Connect +
	Permission.Speak +
	Permission.Video +
	Permission.Listen;

export const DEFAULT_PERMISSION_SAVED_MESSAGES = Permission.GrantAllSafe;

export const DEFAULT_PERMISSION_DIRECT_MESSAGE =
	DEFAULT_PERMISSION + Permission.React + Permission.ManageChannel;

export const DEFAULT_PERMISSION_SERVER =
	DEFAULT_PERMISSION +
	Permission.React +
	Permission.ChangeNickname +
	Permission.ChangeAvatar;

/**
 * Check if all given permission bits are set in a target.
 */
export function bitwiseAndEq(target: bigint | number, ...bits: (bigint | number)[]): boolean {
	if (typeof target === "number") target = BigInt(target);
	for (const bit of bits) {
		const b = typeof bit === "number" ? BigInt(bit) : bit;
		if ((target & b) !== b) return false;
	}
	return true;
}

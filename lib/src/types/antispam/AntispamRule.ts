import ModerationAction from "./ModerationAction";

/**
 * Allow a maximum of X messages per X seconds.
 * Example: max_msg = 5, timeframe = 3, action: Delete
 * Allows a maximum of 5 messages within 3 seconds,
 * and will delete any additional messages.
 *
 * `channels` optionally limits the rule to specific channels.
 *
 * `message` is an optional custom message sent during punishment.
 * '{{userid}}' will be replaced with the user's ID.
 */
class AntispamRule {
	id: string;
	max_msg: number;
	timeframe: number;
	action: ModerationAction;
	channels: string[] | null;
	message: string | null;
}

export default AntispamRule;

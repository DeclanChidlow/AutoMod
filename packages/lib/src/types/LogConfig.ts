export default class LogConfig {
	stoat?: {
		channel?: string;

		// EMBED uses stoat's embeds.
		// PLAIN is like QUOTEBLOCK but without the quotes.
		type?: "EMBED" | "QUOTEBLOCK" | "PLAIN";
	};
}

const PORT = parseInt(process.env.WEB_PORT || "8080");
const API_URL = process.env.PUBLIC_API_URL || "http://localhost:9000";

const titles: Record<string, string> = {
	"/index.html": "Login",
	"/server.html": "Server Settings",
	"/antispam.html": "Anti-Spam",
};

async function servePage(contentPath: string): Promise<Response> {
	const [layout, content] = await Promise.all([
		Bun.file("./static/layout.html").text(),
		Bun.file(`./static/pages${contentPath}`)
			.text()
			.catch(() => null),
	]);
	if (content === null) return new Response("Not found", { status: 404 });

	const title = titles[contentPath] || "Dashboard";
	const html = layout.replace("{{title}}", title).replace("{{content}}", content);
	return new Response(html, { headers: { "Content-Type": "text/html" } });
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		// Inject API URL for client-side JS
		if (path === "/config.js") {
			return new Response(`const API_BASE = ${JSON.stringify(API_URL)};`, {
				headers: { "Content-Type": "application/javascript" },
			});
		}

		// Route dashboard paths to their pages
		if (/^\/dashboard\/[^/]+\/antispam\/?$/.test(path)) {
			path = "/antispam.html";
		} else if (/^\/dashboard\/[^/]+\/?$/.test(path)) {
			path = "/server.html";
		}

		// Default to index for root
		if (path === "/" || path === "") path = "/index.html";

		// Assemble HTML pages via layout template
		if (path.endsWith(".html")) {
			return servePage(path);
		}

		// Static files
		const file = Bun.file(`./static${path}`);
		if (await file.exists()) {
			return new Response(file);
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Web server: http://0.0.0.0:${PORT}`);
console.log(`API backend: ${API_URL}`);

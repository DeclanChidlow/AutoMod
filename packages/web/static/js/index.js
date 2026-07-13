const main = document.getElementById("content");

if (isLoggedIn()) {
	(async () => {
		main.innerHTML += `<hgroup>
				<h1>AutoMod Dashboard</h1>
				<p>Manage AutoMod in your servers.</p>
			</hgroup>`;
		try {
			const data = await request("GET", "/dash/servers");
			const servers = (data.servers || []).sort((a, b) => b.perms - a.perms || a.name.localeCompare(b.name));
			document.querySelector(".loading")?.remove();

			if (!servers.length) {
				main.innerHTML += `<p class="empty">You don't have access to any servers with AutoMod.<br>Invite the bot to a server you manage to get started.</p>`;
				return;
			}

			main.innerHTML +=
				`<div class="server-grid">` +
				servers
					.map(
						(s) => `<div class="server-card" style="background-image: url('${escHtml(s.bannerURL)}')">
						<div class="title">
							${s.iconURL ? `<img src="${escHtml(s.iconURL)}" alt="" class="server-card-icon">` : `<div class="server-card-icon server-card-icon-empty"></div>`}
							<h2><a href="${BASE_PATH}/${s.id}">${escHtml(s.name)}</a></h2>
						</div>
						<ul>
							<li class="perm-badge perm-${s.perms}">${PERMS[s.perms]}</li>
							<li class="server-card-stats">${fmtServerStats(s)}</li>
							<li class="server-card-sub">${fmtServerSub(s)}</li>
						</ul>
					</div>`,
					)
					.join("") +
				`</div>`;
		} catch (e) {
			main.innerHTML += `<p>Failed to load: ${escHtml(e.message)}</p><a href="${BASE_PATH}/" class="btn btn-primary">Retry</a>`;
		}
	})();
} else {
	(async () => {
		let botMention = "@AutoMod";
		try {
			const stats = await request("GET", "/stats");
			if (stats.botId) botMention = "<@" + stats.botId + ">";
		} catch (_) { /* use default */ }

		main.innerHTML += `
	        <h1>AutoMod Dashboard</h1>
	        <form id="login-form">
	            <div class="form-field"><label for="user-field">Stoat User ID:</label>
	                <input type="text" id="user-field" placeholder="Your user ID" required></div>
	            <p class="error" id="login-error" hidden></p>
	            <button type="submit" class="btn btn-primary">Log In</button>
	        </form>
	        <p>Enter your Stoat user ID to begin. You'll get a code to confirm with the bot using <code>${botMention} web login &lt;code&gt;</code>.</p>`;

		let loginNonce, loginUser, loginCode;

		document.getElementById("login-form").addEventListener("submit", async (e) => {
			e.preventDefault();
			document.getElementById("login-error").hidden = true;
			const user = document.getElementById("user-field").value.trim();
			if (!user) return;
			const btn = e.target.querySelector("button");
			btn.disabled = true;
			btn.textContent = "Requesting code…";
			try {
				const result = await request("POST", "/login/begin", { user });
				loginNonce = result.nonce;
				loginUser = user;
				loginCode = result.code;
				renderConfirmStep(result.code);
			} catch (err) {
				document.getElementById("login-error").textContent = err.message;
				document.getElementById("login-error").hidden = false;
				btn.disabled = false;
				btn.textContent = "Log In";
			}
		});

		function renderConfirmStep(code) {
			main.innerHTML = `<h1>Confirm Login</h1>
	            <p>Your login code:</p><div class="code-box">${escHtml(code)}</div>
	            <p>Run this command in a direct message or server channel with AutoMod present:</p>
	            <pre>${botMention} web login ${escHtml(code)}</pre>
	            <p>After running the command, click below to finish.</p>
	            <button id="complete-btn" class="btn btn-primary">Complete Login</button>
	            <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
	            <p class="error" id="complete-error" hidden></p>`;
			ensureErrorBanner();

			document.getElementById("complete-btn").addEventListener("click", completeLogin);
			document.getElementById("cancel-btn").addEventListener("click", () => window.location.reload());
		}

		async function completeLogin() {
			const b = document.getElementById("complete-btn");
			document.getElementById("complete-error").hidden = true;
			b.disabled = true;
			b.textContent = "Completing…";
			try {
				const r = await request("POST", "/login/complete", { user: loginUser, nonce: loginNonce, code: loginCode });
				saveSession(r.user, r.token);
				window.location.href = BASE_PATH + "/";
			} catch (err) {
				document.getElementById("complete-error").textContent = err.message;
				document.getElementById("complete-error").hidden = false;
				b.disabled = false;
				b.textContent = "Complete Login";
			}
		}
	})();
}

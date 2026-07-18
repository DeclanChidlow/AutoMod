if (isLoggedIn()) {
	window.location.href = BASE_PATH + "/";
} else {
	(async () => {
		const main = document.getElementById("content");
		document.querySelector(".loading")?.remove();

		let botMention = "@AutoMod";
		try {
			const stats = await request("GET", "/stats");
			if (stats.botId) botMention = "<@" + stats.botId + ">";
		} catch (_) {
			/* use default */
		}

		main.innerHTML += `<div class="login-card">
		<hgroup>
			<h1>Log In</h1>
			<p>Log in to manage your servers with AutoMod.</p>
		</hgroup>
		<form id="login-form">
			<div class="form-field"><label for="user-field">Your Stoat User ID:</label>
				<input type="text" id="user-field" placeholder="01XXXXXXXXXXXXXXXXXXXXXXXX" required></div>
			<p class="error" id="login-error" hidden></p>
			<button type="submit" class="btn btn-primary">Log In</button>
		</form>
		<p>Don't know how to get your User ID? Run <code>${escHtml(botMention)} info</code> in a server with AutoMod and it'll respond with your User ID.</p>
	</div>`;

		let loginNonce, loginUser, loginCode, pollInterval;

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
			main.innerHTML = `<div class="login-card">
			<hgroup>
				<h1>Confirm Login</h1>
				<p>Your login code is <code>${escHtml(code)}</code>.</p>
			</hgroup>
			<p>Run this command in a direct message or server channel with AutoMod present:</p>
			<pre>${escHtml(botMention)} web login ${escHtml(code)}</pre>
			<p id="login-status">Waiting for confirmation…</p>
			<button id="complete-btn" class="btn btn-primary">Complete Login</button>
			<button id="cancel-btn" class="btn btn-secondary">Cancel</button>
			<p class="error" id="complete-error" hidden></p>
		</div>`;
			ensureErrorBanner();

			const statusEl = document.getElementById("login-status");
			const errorEl = document.getElementById("complete-error");
			const completeBtn = document.getElementById("complete-btn");

			document.getElementById("cancel-btn").addEventListener("click", () => {
				clearInterval(pollInterval);
				window.location.href = BASE_PATH + "/login";
			});

			async function tryCompleteLogin() {
				clearInterval(pollInterval);
				try {
					const r = await request("POST", "/login/complete", {
						user: loginUser,
						nonce: loginNonce,
						code: loginCode,
					});
					statusEl.textContent = "Confirmed! Logging you in…";
					saveSession(r.user, r.token);
					window.location.href = BASE_PATH + "/";
				} catch (err) {
					if (err.message && (err.message.includes("not yet valid") || err.message.includes("rate limit"))) {
						pollInterval = setInterval(tryCompleteLogin, 5000);
						return;
					}
					statusEl.hidden = true;
					errorEl.textContent = err.message || "Something went wrong. Please try again.";
					errorEl.hidden = false;
				}
			}

			completeBtn.addEventListener("click", () => {
				errorEl.hidden = true;
				completeBtn.disabled = true;
				completeBtn.textContent = "Completing…";
				tryCompleteLogin();
			});

			pollInterval = setInterval(tryCompleteLogin, 5000);
		}
	})();
}

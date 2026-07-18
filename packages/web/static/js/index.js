if (!isLoggedIn()) {
	window.location.href = BASE_PATH + "/login";
} else {
	(async () => {
		const main = document.getElementById("content");
		const loadingEl = document.querySelector(".loading");
		if (loadingEl) {
			loadingEl.insertAdjacentHTML(
				"beforebegin",
				`<hgroup>
				<h1>AutoMod Dashboard</h1>
				<p>Manage AutoMod in your servers.</p>
			</hgroup>`,
			);
		}
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
						(s) => `<div class="server-card" style="background-image: url('${escHtml(safeUrl(s.bannerURL))}')">
					<div class="title">
						${s.iconURL ? `<img src="${escHtml(safeUrl(s.iconURL))}" alt="" class="server-card-icon">` : `<div class="server-card-icon server-card-icon-empty"></div>`}
						<h2><a href="${BASE_PATH}/${s.id}">${escHtml(s.name)}</a></h2>
					</div>
					<ul>
						<li class="perm-badge perm-${s.perms}">${PERMS[s.perms]}</li>
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
}

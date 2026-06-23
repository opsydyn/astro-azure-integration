import { defineConfig, logHandlers } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import azureSwa from "@opsydyn/astro-azure-swa";
import foldkit from "@opsydyn/astro-foldkit";

export default defineConfig({
	output: "server",
	logger: logHandlers.compose(logHandlers.console(), logHandlers.json()),
	security: {
		// Chromium's background favicon-fetcher stamps its own requests with
		// Sec-Fetch-Site: cross-site even when same-origin, which trips the
		// dev server's CSRF check. Trusting the dev server's own origin here
		// only matches local http://localhost:4321 traffic — harmless in
		// production, where the real Azure SWA host/protocol never matches it.
		allowedDomains: [{ protocol: "http", hostname: "localhost", port: "4321" }],
	},
	adapter: azureSwa({
		apiRuntime: "node:22",
		staticWebAppConfig: {
			routes: [
				{
					route: "/admin/*",
					allowedRoles: ["authenticated"],
				},
			],
		},
	}),
	integrations: [mdx(), react(), foldkit()],
	vite: {
		optimizeDeps: {
			include: ["foldkit", "foldkit/html", "foldkit/message"],
		},
	},
	markdown: {
		shikiConfig: {
			theme: "dracula",
		},
	},
});

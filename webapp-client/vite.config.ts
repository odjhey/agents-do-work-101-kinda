import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	// Load environment variables for the current mode
	// The third argument (optional) is the prefix; use '' to load all env variables

	const env = loadEnv(mode, process.cwd(), "");
	return {
		server: {
			host: "0.0.0.0",
			allowedHosts: env.ALLOWED_HOSTS
				? env.ALLOWED_HOSTS.split(",")
				: ["localhost"],
			proxy: {
				"/api": {
					target: env.API_PROXY_TARGET || "http://localhost:3000",
					rewrite: (path) => path.replace(/^\/api/, ""),
				},
			},
		},
		plugins: [react()],
	};
});

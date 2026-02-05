import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { graph, type MyConfig, type PromptId } from "./graph";

// note: dupe fn, make a standard/common lib
function getFinalText(output: any): string {
	// output.messages is an array of BaseMessage-like objects
	const last = output?.messages?.at?.(-1);
	// AIMessage usually has .content (string | blocks)
	if (!last) return "";
	if (typeof last.content === "string") return last.content;
	return JSON.stringify(last.content);
}

const app = new Hono();
app.get("/", (c) => c.text("Hello Node.js!"));
app.post("/agent00", async (c) => {
	const promptId: PromptId = "job_role_v1";
	const config: MyConfig = {
		configurable: {
			experiment: "api_call",
			promptId,
			evalCaseId: "api_call",
		},
		tags: ["api", "job-role", promptId],
		metadata: {
			gitSha: process.env.GIT_SHA ?? "local",
		},
		runName: "job-role-agent",
	};

	const body = await c.req.text();

	const res = await graph.invoke(
		{
			llmCalls: 0,
			userIdentity: {
				name: "Johan",
				designation: "Developer - Typescript/Python",
			},
			messages: [
				{
					role: "user",
					content: body,
				},
			],
		},
		config,
	);

	return c.text(getFinalText(res));
});

const PORT = 3000;
const server = serve(
	{
		fetch: app.fetch,
		port: PORT,
	},
	(info) => {
		console.log(`Server is running on ${JSON.stringify(info)}`);
	},
);

// graceful shutdown
process.on("SIGINT", () => {
	server.close();
	process.exit(0);
});
process.on("SIGTERM", () => {
	server.close((err) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		process.exit(0);
	});
});

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream, streamSSE, streamText } from "hono/streaming";
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

app.post("/agent00-stream", (c) => {
	return stream(c, async (stream) => {
		// Write a process to be executed when aborted.
		stream.onAbort(() => {
			console.log("Aborted!");
		});

		// Write a Uint8Array.
		await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));

		const promptId: PromptId = "job_role_v1";
		const config: MyConfig = {
			configurable: {
				experiment: "job_role_eval_2026-02-05",
				promptId,
				evalCaseId: "case_001",
			},
			tags: ["eval", "job-role", promptId],
			metadata: {
				gitSha: process.env.GIT_SHA ?? "local",
			},
			runName: "job-role-agent",
		};

		const body = await c.req.text();
		const chunks = await graph.stream(
			{
				llmCalls: 0,
				userIdentity: {
					name: "Johan",
					designation: "Developer - Erlang and BEAM",
				},
				messages: [
					{
						role: "user",
						content: body,
					},
				],
			},
			{ streamMode: "updates", ...config },
		);

		// // Pipe a readable stream.
		// await stream.pipe(chunks);
		for await (const chunk of chunks) {
			await stream.write(
				new TextEncoder().encode(`${JSON.stringify(chunk)}\n`),
			);
		}
	});
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

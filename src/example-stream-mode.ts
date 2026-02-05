import type { MyConfig, PromptId } from "./graph";
import { graph } from "./graph";

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
				content: "Could help me search a proper job role fit for me?",
			},
		],
	},
	{ streamMode: "updates", ...config },
);

for await (const chunk of chunks) {
	console.log("Received chunk:", chunk);
}

console.log("done!!!");

import fs from "node:fs";
import path from "node:path";
import { graph, type PromptId } from "../src/graph";

type EvalCase = { id: string; messages: { role: string; content: string }[] };
const PROMPT_IDS: PromptId[] = ["job_role_v1", "job_role_v2"];

function readJsonl<T>(filename: string): T[] {
	const lines = fs
		.readFileSync(filename, "utf8")
		.split(/\r?\n/)
		.filter(Boolean);
	return lines.map((l) => JSON.parse(l));
}

function getFinalText(output: any): string {
	// output.messages is an array of BaseMessage-like objects
	const last = output?.messages?.at?.(-1);
	// AIMessage usually has .content (string | blocks)
	if (!last) return "";
	if (typeof last.content === "string") return last.content;
	return JSON.stringify(last.content);
}

async function main() {
	const datasetPath = path.join(process.cwd(), "eval", "job_role_eval.jsonl");
	const userIdentsPath = path.join(process.cwd(), "eval", "user_idents.jsonl");
	const cases = readJsonl<EvalCase>(datasetPath);
	const userIdents = readJsonl<{ name: string; designation: string }>(
		userIdentsPath,
	);

	const experiment = `job_role_eval_${new Date().toISOString().slice(0, 10)}`;
	const rows: any[] = [];

	// matrix
	for (const promptId of PROMPT_IDS) {
		for (const ident of userIdents) {
			for (const c of cases) {
				const t0 = Date.now();
				const out = await graph.invoke(
					{
						messages: c.messages,
						llmCalls: 0,
						userIdentity: { name: ident.name, designation: ident.designation },
					},
					{
						configurable: { experiment, promptId, evalCaseId: c.id },
						tags: ["eval", "job-role", "auto-eval", promptId],
						metadata: { gitSha: process.env.GIT_SHA ?? "local" },
						runName: "job-role-agent",
					},
				);
				const latencyMs = Date.now() - t0;

				const finalText = getFinalText(out);
				// @todo lets create a scoring system next time
				// const score =

				rows.push({
					experiment,
					promptId,
					userIdentityName: ident.name,
					caseId: c.id,
					latencyMs,
					llmCalls: out.llmCalls,
					finalText,
					// pass: score.pass,
					// questionMarks: score.questionMarks,
				});
			}
		}
	}

	fs.writeFileSync(
		path.join(process.cwd(), "eval", `results_${experiment}.json`),
		JSON.stringify(rows, null, 2),
		"utf8",
	);

	console.log("Wrote eval results:", rows.length);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

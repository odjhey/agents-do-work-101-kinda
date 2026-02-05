import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import { register } from "@arizeai/phoenix-otel";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

const provider = register({ projectName: "agents-do-work-101" });

const lcInstrumentation = new LangChainInstrumentation();
lcInstrumentation.manuallyInstrument(CallbackManagerModule);

process.on("beforeExit", async () => {
	await provider.shutdown();
});

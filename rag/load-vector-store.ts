import "dotenv/config";
import fs from "node:fs/promises";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import type { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";

const CACHE_PATH = "./some_vector_cache/memory-vectorstore.json";

export async function loadMemoryVectorStoreFromCache(embeddings: Embeddings) {
	return loadMemoryVectorStore(embeddings, CACHE_PATH);
}

export async function loadMemoryVectorStore(
	embeddings: Embeddings,
	filePath: string,
) {
	const raw = await fs.readFile(filePath, "utf8");
	const parsed = JSON.parse(raw) as {
		version: number;
		memoryVectors: { content: string; metadata: any; embedding: number[] }[];
	};

	const store = new MemoryVectorStore(embeddings);

	const docs = parsed.memoryVectors.map(
		(v) => new Document({ pageContent: v.content, metadata: v.metadata }),
	);
	const vectors = parsed.memoryVectors.map((v) => v.embedding);

	await store.addVectors(vectors, docs);
	return store;
}

export async function smokeTest() {
	const embeddings = new OpenAIEmbeddings({
		model: "text-embedding-3-small",
		apiKey: process.env.OPENAI_API_KEY,
	});

	const vectorStore = await loadMemoryVectorStore(embeddings, CACHE_PATH);

	const r = await vectorStore.similaritySearch("software engineer remote", 5);
	console.log(r);
}

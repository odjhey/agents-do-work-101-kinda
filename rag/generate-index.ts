import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import Papa from "papaparse";

const CACHE_PATH = "./some_vector_cache/memory-vectorstore.json";

type JobRow = {
	"": string; // job_id column is blank header in CSV
	title: string;
	company_name: string;
	description: string;
};

const JOB_SPLITTER = new RecursiveCharacterTextSplitter({
	chunkSize: 900,
	chunkOverlap: 150,
});

function rowToDoc(row: JobRow): Document {
	const jobId = row[""]?.trim();

	// Keep this “header” short but informative — this'll repeat into every chunk.
	const header = `Job ID: ${jobId}\nJob Title: ${row.title}\nCompany: ${row.company_name}\n`;

	// Put the long text after a clear separator
	const body = `Description:\n${row.description ?? ""}`.trim();

	console.log({ header, body });

	return new Document({
		pageContent: `${header}\n${body}`,
		metadata: {
			job_id: jobId,
			title: row.title,
			company_name: row.company_name,
			type: "job_posting",
		},
	});
}

/**
 * Table-aware "splitter":
 * - Row is the atomic unit (1 row -> 1 doc)
 * - If content is too long, split *within* that row only
 * - Ensure every chunk keeps job title / company / job id
 */
async function splitJobDoc(doc: Document): Promise<Document[]> {
	const text = doc.pageContent;

	// If it’s already small enough, don’t split
	if (text.length <= 1100) return [doc];

	// Extract a stable prefix to repeat in each chunk
	// (Here: everything until "Description:" line)
	const marker = "\n\nDescription:\n";
	const idx = text.indexOf(marker);
	const prefix = idx >= 0 ? text.slice(0, idx + marker.length) : "";

	const rest = idx >= 0 ? text.slice(idx + marker.length) : text;

	const chunks = await JOB_SPLITTER.splitText(rest);

	return chunks.map((c, i) => {
		const pageContent = prefix ? `${prefix}${c}` : c;
		return new Document({
			pageContent,
			metadata: {
				...doc.metadata,
				chunk: i,
			},
		});
	});
}

async function transposeCsvToDocuments(): Promise<Document[]> {
	const filename = path.join(process.cwd(), "rag", "job_postings.csv");
	const csv = await fs.readFile(filename, "utf-8");
	const results = Papa.parse<JobRow>(csv, {
		header: true,
		skipEmptyLines: true,
	});

	// Convert rows -> 1 doc per row
	const rowDocs = results.data
		.filter((r) => r && (r.title || r.description || r.company_name))
		.map(rowToDoc);

	// Split only within each row (if needed)
	const splitDocs = (await Promise.all(rowDocs.map(splitJobDoc))).flat();

	return splitDocs;
}

async function main() {
	const embeddings = new OpenAIEmbeddings({
		model: "text-embedding-3-small",
		apiKey: process.env.OPENAI_API_KEY,
	});

	const docs = await transposeCsvToDocuments();

	const vectorStore = new MemoryVectorStore(embeddings);
	await vectorStore.addDocuments(docs);

	console.log(`Loaded ${docs.length} job chunks into MemoryVectorStore.`);
	await saveMemoryVectorStore(vectorStore, CACHE_PATH);

	return vectorStore;
}

export async function saveMemoryVectorStore(
	store: MemoryVectorStore,
	filePath: string,
) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	// memoryVectors is a public array on MemoryVectorStore
	const payload = {
		version: 1,
		memoryVectors: store.memoryVectors.map((mv: any) => ({
			content: mv.content, // string
			metadata: mv.metadata ?? {}, // object
			embedding: mv.embedding, // number[]
			id: mv.id ?? null,
		})),
	};

	await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
}

await main();

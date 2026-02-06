import { useCallback, useState } from "react";
import "./App.css";

function App() {
	const [someVal, setSomeVal] = useState("");

	const startStream = async () => {
		const res = await fetch("/api/agent00-stream", {
			method: "POST",
			body: "Hi, tell me more about yourself.",
		});

		if (!res.body) {
			console.error("No body in response");
			return;
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();

		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process full lines only
			let idx;
			while ((idx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 1);

				if (!line.trim()) continue;

				try {
					const msg = JSON.parse(line);
					if (msg.type === "text") {
						setSomeVal((prev) => prev + msg.text);
					} else if (msg.type === "done") {
						// optional
					}
				} catch (e) {
					console.error("Bad NDJSON line:", line, e);
				}
			}
		}
	};

	const fetchRoot = useCallback(() => {
		fetch("/api")
			.then((res) => res.text())
			.then((data) => setSomeVal(data));
	}, []);

	return (
		<>
			{someVal.length > 0 ? <div>{someVal}</div> : "none"}
			<div>
				<button
					type="button"
					onClick={() => {
						fetchRoot();
					}}
				>
					fetch
				</button>
				<button
					type="button"
					onClick={() => {
						startStream();
					}}
				>
					stream
				</button>
			</div>
		</>
	);
}

export default App;

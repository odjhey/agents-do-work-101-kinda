import { useCallback, useState } from "react";
import "./App.css";

function App() {
	const [someVal, setSomeVal] = useState("");

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
			</div>
		</>
	);
}

export default App;

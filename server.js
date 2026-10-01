const express = require("express");
const cors = require("cors");
const app = express();

app.use(
	cors({
		origin: ["http://127.0.0.1:3000", "http://localhost:3000"],
		credentials: true,
	}),
);

async function requestFlightData({ lamin, lomin, lamax, lomax }) {
	const params = new URLSearchParams({ lamin, lomin, lamax, lomax });
	const url = `https://opensky-network.org/api/states/all?${params}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`OpenSky responded with ${response.status}`);
	}
	return response.json();
}

app.get("/flights", async (req, res) => {
	const box = {};
	for (const key of ["lamin", "lomin", "lamax", "lomax"]) {
		const value = Number(req.query[key]);
		if (req.query[key] === undefined || !Number.isFinite(value)) {
			return res
				.status(400)
				.json({ error: `Missing or invalid query parameter: ${key}` });
		}
		box[key] = value;
	}

	if (
		box.lamin < -90 ||
		box.lamax > 90 ||
		box.lomin < -180 ||
		box.lomax > 180 ||
		box.lamin >= box.lamax ||
		box.lomin >= box.lomax
	) {
		return res.status(400).json({ error: "Coordinates out of range" });
	}

	try {
		res.json(await requestFlightData(box));
	} catch (error) {
		console.error("Error:", error);
		res.status(500).json({ error: "Failed to fetch flight data" });
	}
});

app.listen(5000, () => {
	console.log("Server is running on http://localhost:5000");
});

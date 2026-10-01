const API_BASE = "http://localhost:5000";
const KM_PER_DEGREE = 111;

// Radar geometry (matches the SVG viewBox in index.html)
const CX = 300;
const CY = 300;
const R = 270;
const SVG_NS = "http://www.w3.org/2000/svg";

const locationEl = document.getElementById("location_data");
const statusEl = document.getElementById("status");
const button = document.getElementById("locate-btn");
const slider = document.getElementById("radius-slider");
const radiusInput = document.getElementById("radius-input");
const radarWrap = document.getElementById("radar-wrap");
const radarEl = document.getElementById("radar");
const ringsEl = document.getElementById("rings");
const dotsEl = document.getElementById("dots");
const tooltip = document.getElementById("tooltip");

let userPos = null;
let radiusKm = Number(slider.value);
let latestRequest = 0; // lets us ignore stale responses when the slider moves quickly
let currentFlights = [];
let lastPointerType = "mouse";
let pinned = false;

function setStatus(text, isError = false) {
	statusEl.textContent = text;
	statusEl.classList.toggle("error", isError);
}

/* ---------- Radius controls ---------- */

// The slider is just a convenience (5-100 km); the number input accepts any distance.
function renderRadiusUI() {
	radiusInput.value = radiusKm;
	slider.value = radiusKm; // the browser clamps this to the slider's range
	const pct = ((radiusKm - slider.min) / (slider.max - slider.min)) * 100;
	slider.style.setProperty("--fill", Math.min(Math.max(pct, 0), 100) + "%");
}

// Live label/fill while dragging
slider.addEventListener("input", () => {
	radiusKm = Number(slider.value);
	renderRadiusUI();
});

// Only hit the API once the user lets go
slider.addEventListener("change", () => {
	if (userPos) getFlightData();
});

// Typed distance: fires on Enter or when the field loses focus
radiusInput.addEventListener("change", () => {
	const value = Number(radiusInput.value);
	if (!Number.isFinite(value) || value <= 0) {
		renderRadiusUI(); // invalid: put the previous value back
		return;
	}
	radiusKm = Math.max(value, 1);
	renderRadiusUI();
	if (userPos) getFlightData();
});

renderRadiusUI();

/* ---------- Radar rings ---------- */

function drawRings(radius) {
	let html = "";
	for (let i = 1; i <= 4; i++) {
		const r = (R * i) / 4;
		const km = Number(((radius * i) / 4).toFixed(1));
		html += `<circle class="ring" cx="${CX}" cy="${CY}" r="${r}"/>`;
		html += `<text class="ring-label" x="${CX + 5}" y="${CY - r - 4}">${km} km</text>`;
	}
	ringsEl.innerHTML = html;
}

drawRings(radiusKm);

/* ---------- Location ---------- */

function startTracking() {
	if (!navigator.geolocation) {
		setStatus("Geolocation is not supported by this browser.", true);
		return;
	}
	button.disabled = true;
	setStatus("Getting your location…");

	navigator.geolocation.getCurrentPosition(
		(data) => {
			userPos = data.coords;
			showPosition(data);
			getFlightData();
		},
		(error) => {
			button.disabled = false;
			setStatus("Location error: " + error.message, true);
		},
	);
}

function showPosition(position) {
	const { latitude, longitude, accuracy } = position.coords;
	locationEl.innerHTML = `
		<div class="stat"><span>Latitude</span><strong>${latitude.toFixed(4)}</strong></div>
		<div class="stat"><span>Longitude</span><strong>${longitude.toFixed(4)}</strong></div>
		<div class="stat"><span>Accuracy</span><strong>${Math.round(accuracy)} m</strong></div>`;
}

/* ---------- Flights ---------- */

function getBounds(radius) {
	const latDelta = radius / KM_PER_DEGREE;
	// Longitude degrees shrink toward the poles
	const cosLat = Math.max(Math.cos((userPos.latitude * Math.PI) / 180), 0.01);
	const lonDelta = radius / (KM_PER_DEGREE * cosLat);

	return {
		lamin: Math.max(userPos.latitude - latDelta, -90),
		lamax: Math.min(userPos.latitude + latDelta, 90),
		lomin: Math.max(userPos.longitude - lonDelta, -180),
		lomax: Math.min(userPos.longitude + lonDelta, 180),
	};
}

function clearDots() {
	currentFlights = [];
	dotsEl.innerHTML = "";
	hideTooltip();
}

function getFlightData() {
	const requestId = ++latestRequest;
	const radius = radiusKm; // capture: the slider may move before the response arrives
	const params = new URLSearchParams(getBounds(radius));
	const url = `${API_BASE}/flights?${params}`;
	console.log("requesting flight data from URL:\n", url);

	setStatus(`Looking for flights within ${radius} km…`);

	fetch(url)
		.then((response) => {
			if (!response.ok)
				throw new Error("Server responded " + response.status);
			return response.json();
		})
		.then((data) => {
			if (requestId !== latestRequest) return; // a newer request superseded this one
			console.log("Flight data received:", data);
			displayFlightData(data, radius);
		})
		.catch((error) => {
			if (requestId !== latestRequest) return;
			console.error("Error fetching flight data:", error);
			clearDots();
			setStatus("Error fetching flight data.", true);
		})
		.finally(() => {
			if (requestId !== latestRequest) return;
			button.disabled = false;
			button.textContent = "Refresh";
		});
}

function distanceKm(lat1, lon1, lat2, lon2) {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

// Convert a lat/lon into radar (SVG) coordinates, north up
function toRadarXY(lat, lon, radius) {
	const cosLat = Math.cos((userPos.latitude * Math.PI) / 180);
	const dxKm = (lon - userPos.longitude) * cosLat * KM_PER_DEGREE;
	const dyKm = (lat - userPos.latitude) * KM_PER_DEGREE;
	return {
		x: CX + (dxKm / radius) * R,
		y: CY - (dyKm / radius) * R,
	};
}

function displayFlightData(data, radius) {
	hideTooltip();
	drawRings(radius);

	const flights = (data && data.states ? data.states : [])
		.map((f) => ({
			callsign: (f[1] || "").trim() || "Unknown",
			country: f[2] || "—",
			lon: f[5],
			lat: f[6],
			altitude: f[7],
			onGround: f[8],
			speed: f[9],
			heading: f[10],
		}))
		.map((f) => ({
			...f,
			distance:
				f.lat != null && f.lon != null
					? distanceKm(
							userPos.latitude,
							userPos.longitude,
							f.lat,
							f.lon,
						)
					: null,
		}))
		// The API returns a square; trim the corners so it's a true circle
		.filter((f) => f.distance != null && f.distance <= radius)
		.sort((a, b) => a.distance - b.distance);

	currentFlights = flights;

	if (flights.length === 0) {
		dotsEl.innerHTML = "";
		setStatus(
			`No flights within ${radius} km right now. Try a larger radius.`,
		);
		return;
	}

	setStatus(
		`${flights.length} flight${flights.length === 1 ? "" : "s"} within ${radius} km — hover a dot for details`,
	);

	dotsEl.innerHTML = flights
		.map((f, i) => {
			const { x, y } = toRadarXY(f.lat, f.lon, radius);
			let tick = "";
			if (f.heading != null && !f.onGround) {
				const a = (f.heading * Math.PI) / 180;
				const x2 = x + Math.sin(a) * 13;
				const y2 = y - Math.cos(a) * 13;
				tick = `<line class="heading" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
			}
			return `
				<g class="dot-group" data-i="${i}">
					${tick}
					<circle class="dot ${f.onGround ? "ground" : "air"}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5"/>
					<circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14"/>
				</g>`;
		})
		.join("");
}

/* ---------- Hover card ---------- */

function tooltipHTML(f) {
	return `
		<header>
			<h3>${escapeHtml(f.callsign)}</h3>
			<span class="badge ${f.onGround ? "ground" : "air"}">${f.onGround ? "On ground" : "Airborne"}</span>
		</header>
		<p class="country">${escapeHtml(f.country)}</p>
		<dl>
			<div><dt>Altitude</dt><dd>${f.altitude != null ? Math.round(f.altitude).toLocaleString() + " m" : "—"}</dd></div>
			<div><dt>Speed</dt><dd>${f.speed != null ? Math.round(f.speed * 3.6) + " km/h" : "—"}</dd></div>
			<div><dt>Heading</dt><dd>${f.heading != null ? Math.round(f.heading) + "°" : "—"}</dd></div>
			<div><dt>Distance</dt><dd>${f.distance.toFixed(1)} km</dd></div>
		</dl>`;
}

function positionTooltip(clientX, clientY) {
	const rect = radarWrap.getBoundingClientRect();
	const gap = 16;
	let x = clientX - rect.left + gap;
	let y = clientY - rect.top + gap;

	// Flip to the other side of the cursor if it would overflow the map area
	if (x + tooltip.offsetWidth > rect.width)
		x = clientX - rect.left - tooltip.offsetWidth - gap;
	if (y + tooltip.offsetHeight > rect.height)
		y = clientY - rect.top - tooltip.offsetHeight - gap;

	tooltip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
}

function showTooltip(group, event) {
	const flight = currentFlights[Number(group.dataset.i)];
	if (!flight) return;
	document
		.querySelectorAll(".dot-group.active")
		.forEach((g) => g.classList.remove("active"));
	group.classList.add("active");
	tooltip.innerHTML = tooltipHTML(flight);
	tooltip.classList.add("show");
	positionTooltip(event.clientX, event.clientY);
}

function hideTooltip() {
	pinned = false;
	tooltip.classList.remove("show");
	document
		.querySelectorAll(".dot-group.active")
		.forEach((g) => g.classList.remove("active"));
}

radarEl.addEventListener("pointerdown", (e) => {
	lastPointerType = e.pointerType;
});

radarEl.addEventListener("pointerover", (e) => {
	const group = e.target.closest(".dot-group");
	if (group && !pinned) showTooltip(group, e);
});

radarEl.addEventListener("pointermove", (e) => {
	if (!pinned && tooltip.classList.contains("show"))
		positionTooltip(e.clientX, e.clientY);
});

radarEl.addEventListener("pointerout", (e) => {
	if (pinned) return;
	const leavingDot = e.target.closest(".dot-group");
	const enteringDot =
		e.relatedTarget &&
		e.relatedTarget.closest &&
		e.relatedTarget.closest(".dot-group");
	if (leavingDot && !enteringDot && e.pointerType !== "touch") hideTooltip();
});

// Touch has no hover: tapping a dot pins its card, tapping elsewhere dismisses it
radarEl.addEventListener("click", (e) => {
	const group = e.target.closest(".dot-group");
	if (group && lastPointerType === "touch") {
		pinned = false;
		showTooltip(group, e);
		pinned = true;
	} else if (!group) {
		hideTooltip();
	}
});

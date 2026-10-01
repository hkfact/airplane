# Flights Overhead

A small web app that shows live aircraft around your location on a radar-style map. Share your location, pick a search radius, and see nearby flights as dots. Hover a dot to see its details.

Flight data comes from the [OpenSky Network](https://opensky-network.org/) API, proxied through a tiny Express server.

## Features

- **Radar map**: you're at the centre, flights are plotted by their real distance and bearing, north up
- **Hover cards**: callsign, country, altitude, speed, heading and distance for each flight (tap to pin on touch screens)
- **Adjustable radius**: a 5–100 km slider, plus a number input that accepts any distance
- **Direction ticks**: airborne flights show a small tick pointing the way they're heading
- **Airborne vs. on-ground** flights are colour-coded
- **Light and dark mode** that follow your system setting

## Project structure

```
.
├── index.html   # page markup (radar SVG, radius controls)
├── style.css    # all styling
├── script.js    # geolocation, API calls, radar rendering, hover card
└── server.js    # Express API that queries OpenSky for a bounding box
```

## Requirements

- Node.js 18 or newer (the server uses the built-in `fetch`)
- A browser that supports the Geolocation API

## Getting started

1. **Install the server dependencies**

    ```bash
    npm init -y
    npm install express cors
    ```

2. **Start the API server** (runs on port 5000)

    ```bash
    node server.js
    ```

3. **Serve the front end** on port 3000 (in a second terminal, from the project folder)

    ```bash
    npx serve -l 3000
    ```

4. Open <http://localhost:3000>, click **Find flights near me**, and allow location access.

> The front end must be served from `http://localhost:3000` or `http://127.0.0.1:3000`, because those are the origins the server's CORS config allows. Opening `index.html` directly from disk (`file://`) won't work, since geolocation and CORS both need a proper origin.

## How it works

1. The browser gets your coordinates with `navigator.geolocation`.
2. `script.js` converts your chosen radius (km) into a latitude/longitude bounding box and calls the local API.
3. `server.js` validates the box and forwards it to OpenSky.
4. The response is trimmed to a true circle using the haversine distance, then each flight is drawn on the radar at its offset from you.

## API

### `GET /flights`

Returns the OpenSky `states/all` response for a bounding box.

| Query parameter | Description                     |
| --------------- | ------------------------------- |
| `lamin`         | Minimum latitude (−90 to 90)    |
| `lamax`         | Maximum latitude (−90 to 90)    |
| `lomin`         | Minimum longitude (−180 to 180) |
| `lomax`         | Maximum longitude (−180 to 180) |

Example:

```
http://localhost:5000/flights?lamin=34.8&lamax=36.8&lomin=9.5&lomax=11.5
```

Responses:

- `200`: OpenSky JSON (`{ time, states: [...] }`)
- `400`: a parameter is missing, not a number, out of range, or min ≥ max
- `500`: the request to OpenSky failed (including rate limiting)

## Configuration

| What                      | Where                                    |
| ------------------------- | ---------------------------------------- |
| API server URL            | `API_BASE` in `script.js`                |
| Server port               | `app.listen(5000, ...)` in `server.js`   |
| Allowed front-end origins | `cors({ origin: [...] })` in `server.js` |

## Notes and limitations

- OpenSky's anonymous access is rate limited, and larger search areas use more of your allowance. Very large radii will often fail with an error.
- Positions are approximate: OpenSky reports the last known state, which can be several seconds old, and not every aircraft is covered.
- Distances and radar positions use a flat-earth approximation of about 111 km per degree, which is accurate enough at these scales but gets less exact for very large radii.

## Credits

Flight data provided by the [OpenSky Network](https://opensky-network.org/).

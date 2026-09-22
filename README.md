# Bloom

A small interactive experience that turns a word into a procedural flower.

## About

Bloom uses a procedural Canvas 2D renderer to grow a flower from the word you enter. Press Enter to start a bloom, then download the finished result as a high-resolution artwork card.

## Tech

- HTML
- CSS
- JavaScript
- Canvas 2D

## Run locally

There are no dependencies or build steps. Start a local server from the project directory:

```bash
python3 -m http.server 5500
```

Then open [http://localhost:5500](http://localhost:5500).

You can also open `index.html` with VS Code Live Server.

## Responsive / performance notes

The renderer is designed for both desktop and mobile browsers. The canvas uses the layout viewport to avoid Safari URL-bar and keyboard resize jumps, the flower scales to the available visual stage, and mobile rendering uses a lighter particle/petal workload.

The bloom animation uses staggered petal timing, eased growth, subtle stem sway, ambient glow, and a restrained particle finish. The petal renderer avoids creating a new gradient for every petal on every frame.

## License

MIT License

## Author

Mikael Kalesaran

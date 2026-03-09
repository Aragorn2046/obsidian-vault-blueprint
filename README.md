# Obsidian Vault Blueprint

An interactive visual architecture map for your Obsidian vault. See how your notes, commands, automations, and knowledge base connect — at a glance.

![Blueprint Screenshot](screenshot.png)

## Features

- **Interactive canvas** — pan, zoom, drag nodes, click to inspect
- **Connection tracing** — Shift+click two nodes to find the path between them
- **Category filtering** — toggle visibility by node type via the legend
- **Search** — Ctrl+F to search nodes by title, description, or path
- **Info panel** — click any node to see its description, file path, and connections
- **Wire tooltips** — hover connections to see what they represent
- **Minimap** — bottom-right overview of the full graph
- **Export PNG** — one-click export of the current view
- **Zero dependencies** — single HTML file, works offline via `file:///`

## Quick Start

1. Clone this repo
2. Copy `demo-blueprint.json` to `blueprint.json`
3. Edit `blueprint.json` with your vault's architecture
4. Open `index.html` in a browser

Your `blueprint.json` is gitignored — your vault structure stays private.

## Blueprint JSON Schema

```json
{
  "meta": {
    "title": "My Vault Blueprint",
    "subtitle": "Optional description"
  },
  "categories": {
    "category-id": {
      "color": "#6366f1",
      "dark": "#35386e",
      "label": "Display Name"
    }
  },
  "groups": [
    {
      "label": "Group Label",
      "color": "#6366f1",
      "x": 60, "y": 40,
      "w": 280, "h": 260
    }
  ],
  "nodes": [
    {
      "id": "unique-id",
      "cat": "category-id",
      "title": "Display Title",
      "x": 100, "y": 80,
      "path": "vault/path/to/file.md",
      "desc": "What this node does.",
      "pins": {
        "in": [{ "id": "pin-id", "label": "pin label" }],
        "out": [{ "id": "pin-id", "label": "pin label" }]
      }
    }
  ],
  "wires": [
    {
      "from": "node-id.out-pin-id",
      "to": "node-id.in-pin-id",
      "color": "#6366f1"
    }
  ]
}
```

### Categories

Define the types of nodes in your vault. Each needs a `color` (foreground), `dark` (header background), and `label`.

### Groups

Visual background boxes that group related nodes. Position with `x`, `y`, `w`, `h`. Optional `catRef` to auto-hide when that category is toggled off.

### Nodes

Each node represents a file, command, script, or concept in your vault.

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (used in wires) |
| `cat` | Yes | Category key |
| `title` | Yes | Display name |
| `x`, `y` | Yes | Position on canvas |
| `path` | No | File path shown in info panel |
| `desc` | No | Description shown in info panel |
| `pins.in` | No | Input connection points |
| `pins.out` | No | Output connection points |

### Wires

Connections between nodes. Format: `"node-id.pin-id"` for both `from` and `to`.

## Tips

- **Layout**: Group related nodes visually. Use the group boxes to create labeled sections.
- **Pins**: Think of pins as the "API" of each node — what does it read (in) and what does it produce (out)?
- **Colors**: Use consistent colors per category. The legend auto-generates from your categories.
- **Drag nodes**: You can reposition nodes by dragging them directly on the canvas.
- **Path tracing**: Select a node, then Shift+click another to highlight the shortest path between them.

## Roadmap

- [ ] Obsidian community plugin (auto-generate blueprint from vault structure)
- [ ] Live updates when vault changes
- [ ] Health metrics (orphaned notes, broken links, schema compliance)
- [ ] Workflow visualization (trigger chains)

## License

MIT

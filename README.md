<p align="center">
  <img src="https://img.shields.io/badge/WebEcho-v1.0.0-blue" alt="WebEcho Version"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Runtime-Bun-green" alt="Bun"/>
  <img src="https://img.shields.io/badge/License-MIT-purple" alt="License"/>
</p>

<h1 align="center">WebEcho</h1>

<p align="center">
  <i>Developer-grade website replication engine. Clone entire websites—not just single pages—to your local machine with a single command.</i>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a>
</p>

---

## Overview

WebEcho is a powerful **multi-page website cloning tool** that recursively crawls and downloads complete websites to your local directory. Unlike simple page downloaders, WebEcho follows links, discovers pages, and captures entire site structures—including HTML, CSS, JavaScript, images, fonts, and other assets—while preserving the original site's link structure. Browse cloned sites offline as if you were viewing them online.

### Why WebEcho?

- **Multi-Page Crawling** – Automatically discovers and clones linked pages recursively
- **Two Crawling Modes**: Browser-based for SPAs, HTTP-based for static sites
- **Smart Asset Handling**: Automatic deduplication and organized storage
- **URL Rewriting**: All links work locally without broken references
- **Authentication Support**: Clone protected websites with ease
- **Depth Control**: Control how deep to crawl (default: 3 levels deep)
- **Progress Tracking**: Real-time feedback on cloning progress

---

## Features

### Multi-Page Crawling Engine

WebEcho isn't a single-page downloader—it's a **recursive website crawler** that:

- Discovers all pages by following links automatically
- Crawls to configurable depth (3 levels by default)
- Handles both static sites and JavaScript-driven SPAs
- Processes hundreds of pages in a single run

### Dual Crawling Modes

| Mode | Best For | Technology |
|------|----------|------------|
| **`clone`** | JavaScript-heavy sites, SPAs, dynamic content | Playwright |
| **`http-clone`** | Static HTML sites, faster execution | Fetch + Cheerio |

### Core Capabilities

- **Recursive Link Discovery** – Automatically finds and follows all links
- **Depth-based Crawling** – Control how many levels deep to clone
- **Page Limits** – Safety limits to prevent runaway crawls
- **Asset Filtering** – Select specific asset types (CSS, JS, images, fonts)
- **Concurrent Downloads** – Parallel processing for faster cloning
- **Duplicate Detection** – SHA-256 hashing prevents duplicate downloads
- **Robots.txt Compliance** – Respects site crawling rules (optional)
- **Authentication** – Basic auth, bearer tokens, cookies, form login
- **URL Rewriting** – All links converted to local paths
- **Manifest Generation** – JSON manifest with metadata

### Asset Handling

- Assets organized by type (`assets/css`, `assets/js`, `assets/img`, `assets/fonts`)
- CSS URL rewriting including font references
- Responsive image support (srcset attributes)
- Inline CSS and script processing
- Hash-based filenames for deduplication

---

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Node.js 18+ (for Playwright)

### Install Dependencies

```bash
# Clone the repository
git clone https://github.com/yourusername/webecho.git
cd webecho

# Install dependencies
bun install

# Install Playwright browsers (required for clone command)
npx playwright install
```

---

## Quick Start

### How Multi-Page Crawling Works

WebEcho starts at your target URL and **recursively follows links** to discover and clone all pages on the site. By default, it crawls **3 levels deep**:

```
example.com/              ← Level 0 (start page)
├── about.html            ← Level 1 (linked from home)
├── contact.html          ← Level 1
├── products/
│   ├── product-a.html    ← Level 2
│   └── product-b.html    ← Level 2
└── blog/
    ├── post-1.html       ← Level 2
    └── post-1.html
        └── comments.html ← Level 3
```

### Basic Usage

```bash
# Clone an entire website (browser mode - best for SPAs)
bun run index.ts clone https://example.com

# Clone to a specific directory
bun run index.ts clone https://example.com ./my-clone

# Clone with custom depth (crawl 5 levels deep)
bun run index.ts clone https://example.com --depth 5

# Clone a static site (faster HTTP mode)
bun run index.ts http-clone https://example.com --depth 2
```

### Output Structure

After crawling, you get a complete, browsable website:

```
my-clone/
├── index.html                    # Home page
├── about.html                    # Level 1 page
├── contact.html                  # Level 1 page
├── products.html                 # Level 1 page
├── products/
│   ├── product-a.html            # Level 2 pages
│   └── product-b.html
├── blog.html                     # Level 1 page
└── assets/
    ├── css/
    │   └── a1b2c3d4...style.css  # All site stylesheets
    ├── js/
    │   ├── e5f6g7h8...app.js     # All site scripts
    │   └── i9j0k1l2...analytics.js
    ├── img/
    │   ├── m3n4o5p6...logo.png   # All images
    │   └── q7r8s9t0...hero.jpg
    └── fonts/
        └── u1v2w3x4...font.woff2 # All fonts
```

---

## Usage

### Browser Mode (`clone`)

For JavaScript-heavy sites and Single Page Applications. Recursively follows all discovered links:

```bash
bun run index.ts clone <url> [output] [options]
```

**Examples:**

```bash
# Basic multi-page clone (crawls 3 levels deep by default)
bun run index.ts clone https://example.com

# Clone with custom depth and page limits
bun run index.ts clone https://example.com ./output --depth 5 --max-pages 200

# Deep crawl for large sites
bun run index.ts clone https://example.com --depth 10 --max-pages 1000 --concurrency 10

# With custom timeout and wait for selector (for SPAs)
bun run index.ts clone https://example.com --timeout 30000 --wait-for-selector ".loaded"

# Headed browser (visible window) – useful for debugging
bun run index.ts clone https://example.com --no-headless
```

### HTTP Mode (`http-clone`)

For static sites – faster execution with the same multi-page crawling:

```bash
bun run index.ts http-clone <url> [output] [options]
```

**Examples:**

```bash
# Basic multi-page HTTP clone
bun run index.ts http-clone https://example.com

# Deep crawl with higher concurrency for faster cloning
bun run index.ts http-clone https://example.com --depth 5 --concurrency 20

# Shallow clone (homepage + 1 level of links)
bun run index.ts http-clone https://example.com --depth 1
```

---

## Configuration

### Controlling Multi-Page Crawls

The key to WebEcho's power is controlling **how many pages** and **how deep** to crawl:

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `--depth <number>` | How many levels deep to follow links | `3` | `--depth 5` |
| `--max-pages <number>` | Total pages to download (safety limit) | `100` | `--max-pages 500` |
| `--max-assets <number>` | Total assets to download | `1000` | `--max-assets 5000` |
| `--concurrency <number>` | Parallel requests (faster = more resources) | `5` | `--concurrency 10` |

**Depth Examples:**
- `--depth 0` – Only the start page
- `--depth 1` – Start page + all directly linked pages
- `--depth 3` – Start page + linked pages + their links + one more level (default)
- `--depth 10` – Deep crawl for large sites

### Asset Options

| Option | Description | Default |
|--------|-------------|---------|
| `--no-assets` | Skip asset downloading | `false` |
| `--asset-types <types>` | Asset types to download (comma-separated) | `css,js,img,fonts` |
| `--include <patterns>` | URL patterns to include | all |
| `--exclude <patterns>` | URL patterns to exclude | none |

### Browser Options

| Option | Description | Default |
|--------|-------------|---------|
| `--headless` | Run browser in headless mode | `true` |
| `--timeout <ms>` | Navigation timeout | `30000` |
| `--wait-for-selector <selector>` | Wait for CSS selector | none |
| `--wait-for-idle <ms>` | Wait for network idle | `500` |

### Authentication

| Option | Description |
|--------|-------------|
| `--auth-type <type>` | Authentication type: `basic`, `bearer`, `cookie`, `form` |
| `--username <user>` | Username for basic/form auth |
| `--password <pass>` | Password for basic/form auth |
| `--token <token>` | Bearer token |
| `--cookies <cookies>` | Cookie string |

**Example:**

```bash
# Basic authentication
bun run index.ts clone https://example.com --auth-type basic --username admin --password secret

# Bearer token
bun run index.ts clone https://api.example.com --auth-type bearer --token "your-token"
```

### Other Options

| Option | Description |
|--------|-------------|
| `--skip-robots` | Skip robots.txt checking |
| `--user-agent <string>` | Custom user agent |
| `--clean` | Clean output directory before starting |
| `--verbose` | Verbose output |
| `--quiet` | Quiet mode (minimal output) |

---

## Use Cases

- **Offline Browsing** – Clone entire documentation sites, blogs, or wikis for offline access
- **Website Archiving** – Preserve complete websites before they go offline or change
- **Development Testing** – Clone production sites (multi-page) for local testing
- **Content Migration** – Extract entire site structures for CMS migration
- **SEO Analysis** – Crawl competitor sites to analyze their page structure
- **Backup** – Create complete backups of your own websites

---

## Output

After cloning, you'll find:

1. **HTML Files** – All pages with rewritten local links
2. **Assets Directory** – Organized CSS, JS, images, and fonts
3. **Manifest File** – `webecho-manifest.json` with cloning metadata

### Manifest Example

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "url": "https://example.com",
  "pages": 42,
  "assets": 156,
  "depth": 3
}
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License – see LICENSE file for details

---

<p align="center">
  <i>Built with TypeScript, powered by Playwright</i>
</p>

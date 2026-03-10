<p align="center">
  <img src="https://img.shields.io/badge/WebEcho-v1.0.0-blue" alt="WebEcho Version"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Runtime-Bun-green" alt="Bun"/>
  <img src="https://img.shields.io/badge/License-MIT-purple" alt="License"/>
</p>

<h1 align="center">WebEcho</h1>

<p align="center">
  <i>Developer-grade website replication engine. Clone entire websites to your local machine with a single command.</i>
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

WebEcho is a powerful website cloning tool that downloads complete websites to your local directory. It captures HTML, CSS, JavaScript, images, fonts, and other assets while preserving the original site's link structure. Browse cloned sites offline as if you were viewing them online.

### Why WebEcho?

- **Two Crawling Modes**: Browser-based for SPAs, HTTP-based for static sites
- **Smart Asset Handling**: Automatic deduplication and organized storage
- **URL Rewriting**: All links work locally without broken references
- **Authentication Support**: Clone protected websites with ease
- **Depth Control**: Control how deep to crawl
- **Progress Tracking**: Real-time feedback on cloning progress

---

## Features

### Dual Crawling Modes

| Mode | Best For | Technology |
|------|----------|------------|
| **`clone`** | JavaScript-heavy sites, SPAs, dynamic content | Playwright |
| **`http-clone`** | Static HTML sites, faster execution | Fetch + Cheerio |

### Core Capabilities

- **Depth-based Crawling** – Control how many levels deep to clone
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

### Basic Usage

```bash
# Clone a website (browser mode - best for SPAs)
bun run index.ts clone https://example.com

# Clone to a specific directory
bun run index.ts clone https://example.com ./my-clone

# Clone a static site (faster HTTP mode)
bun run index.ts http-clone https://example.com --depth 2
```

### Output Structure

```
my-clone/
├── index.html
├── about.html
├── contact.html
└── assets/
    ├── css/
    │   └── a1b2c3d4...style.css
    ├── js/
    │   └── e5f6g7h8...app.js
    ├── img/
    │   └── i9j0k1l2...logo.png
    └── fonts/
        └── m3n4o5p6...font.woff2
```

---

## Usage

### Browser Mode (`clone`)

For JavaScript-heavy sites and Single Page Applications:

```bash
bun run index.ts clone <url> [output] [options]
```

**Examples:**

```bash
# Basic clone
bun run index.ts clone https://example.com

# With depth limit and page limit
bun run index.ts clone https://example.com ./output --depth 2 --max-pages 50

# With custom timeout and wait for selector
bun run index.ts clone https://example.com --timeout 30000 --wait-for-selector ".loaded"

# Headed browser (visible window)
bun run index.ts clone https://example.com --no-headless
```

### HTTP Mode (`http-clone`)

For static sites – faster execution:

```bash
bun run index.ts http-clone <url> [output] [options]
```

**Examples:**

```bash
# Basic HTTP clone
bun run index.ts http-clone https://example.com

# With depth and concurrency
bun run index.ts http-clone https://example.com --depth 3 --concurrency 10
```

---

## Configuration

### Crawl Control

| Option | Description | Default |
|--------|-------------|---------|
| `--depth <number>` | Maximum crawl depth | `3` |
| `--max-pages <number>` | Maximum pages to download | `100` |
| `--max-assets <number>` | Maximum assets to download | `1000` |
| `--concurrency <number>` | Concurrent requests | `5` |

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

- **Offline Browsing** – Access websites without internet connection
- **Website Archiving** – Preserve sites for future reference
- **Development Testing** – Clone production sites for local testing
- **Content Migration** – Extract site content for CMS migration
- **Documentation** – Create offline copies of documentation sites
- **Competitor Analysis** – Study competitor site structures

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

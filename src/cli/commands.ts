// =====================================================
// WebEcho - CLI Commands
// =====================================================

import { Command } from "commander";
import type { CliOptions } from "../config/types.js";
import { CrawlConfigBuilder } from "../config/types.js";
import { ProgressReporter } from "./progress.js";
import type { CrawlResult } from "../types/index.js";

// ==================== Command Factory ====================

/**
 * Create the CLI program with all commands
 */
export function createCli(): Command {
  const program = new Command();

  program
    .name("webecho")
    .description("Developer-grade website replication engine")
    .version("0.1.0");

  // Clone command (browser-based)
  program
    .command("clone")
    .description("Clone a website using a browser (Playwright)")
    .argument("<url>", "URL of the website to clone")
    .argument("[output]", "Output directory (default: ./clone)")
    .option("-d, --depth <number>", "Maximum crawl depth (default: 3)", "3")
    .option("-p, --max-pages <number>", "Maximum number of pages (default: 100)", "100")
    .option("-a, --max-assets <number>", "Maximum number of assets (default: 1000)", "1000")
    .option("-c, --concurrency <number>", "Number of concurrent requests (default: 5)", "5")
    .option("--no-assets", "Don't download assets")
    .option("--asset-types <types>", "Asset types to download (comma-separated)", "css,js,image,font")
    .option("--headless", "Run browser in headless mode (default: true)", "true")
    .option("--timeout <number>", "Navigation timeout in ms (default: 30000)", "30000")
    .option("--wait-for-selector <selector>", "Wait for CSS selector before capturing")
    .option("--wait-for-idle <number>", "Wait for network idle time in ms", "500")
    .option("--auth-type <type>", "Authentication type: basic, bearer, cookie, form")
    .option("--username <username>", "Username for authentication")
    .option("--password <password>", "Password for authentication")
    .option("--token <token>", "Bearer token for authentication")
    .option("--cookies <cookies>", "Cookies for authentication (format: name1=value1; name2=value2)")
    .option("--include <patterns>", "URL patterns to include (comma-separated)")
    .option("--exclude <patterns>", "URL patterns to exclude (comma-separated)")
    .option("--skip-robots", "Skip robots.txt checking")
    .option("--user-agent <agent>", "Custom user agent string")
    .option("-v, --verbose", "Verbose output")
    .option("-q, --quiet", "Quiet mode (minimal output)")
    .option("--clean", "Clean output directory before starting")
    .action(async (url: string, output: string = "./clone", options: any) => {
      await handleClone(url, output, options);
    });

  // HTTP Clone command (no browser - faster for static sites)
  program
    .command("http-clone")
    .description("Clone a website using HTTP requests only (no browser, faster for static sites)")
    .argument("<url>", "URL of the website to clone")
    .argument("[output]", "Output directory (default: ./clone)")
    .option("-d, --depth <number>", "Maximum crawl depth (default: 3)", "3")
    .option("-p, --max-pages <number>", "Maximum number of pages (default: 100)", "100")
    .option("-a, --max-assets <number>", "Maximum number of assets (default: 1000)", "1000")
    .option("--include <patterns>", "URL patterns to include (comma-separated)")
    .option("--exclude <patterns>", "URL patterns to exclude (comma-separated)")
    .option("--skip-robots", "Skip robots.txt checking")
    .option("--user-agent <agent>", "Custom user agent string")
    .option("-v, --verbose", "Verbose output")
    .option("-q, --quiet", "Quiet mode (minimal output)")
    .action(async (url: string, output: string = "./clone", options: any) => {
      await handleHttpClone(url, output, options);
    });

  // Serve command - start local HTTP server for cloned site
  program
    .command("serve")
    .description("Start a local HTTP server to view a cloned site")
    .argument("[directory]", "Directory to serve (default: ./clone)")
    .option("-p, --port <number>", "Port to serve on (default: 8080)", "8080")
    .option("-o, --open", "Open browser automatically")
    .action(async (directory: string = "./clone", options: any) => {
      await handleServe(directory, options);
    });

  return program;
}

// ==================== Command Handlers ====================

/**
 * Handle the clone command
 */
async function handleClone(url: string, output: string, options: any): Promise<void> {
  const cliOptions: CliOptions = {
    url,
    output,
    depth: options.depth ? parseInt(options.depth, 10) : undefined,
    maxPages: options.maxPages ? parseInt(options.maxPages, 10) : undefined,
    maxAssets: options.maxAssets ? parseInt(options.maxAssets, 10) : undefined,
    concurrency: options.concurrency ? parseInt(options.concurrency, 10) : undefined,
    noAssets: options.noAssets ?? false,
    assetTypes: options.assetTypes ? options.assetTypes.split(",").map((s: string) => s.trim()) : undefined,
    headless: options.headless === "true",
    timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
    waitForSelector: options.waitForSelector,
    waitForIdle: options.waitForIdle ? parseInt(options.waitForIdle, 10) : undefined,
    authType: options.authType,
    username: options.username,
    password: options.password,
    token: options.token,
    cookies: options.cookies,
    include: options.include ? options.include.split(",") : undefined,
    exclude: options.exclude ? options.exclude.split(",") : undefined,
    skipRobots: options.skipRobots ?? false,
    userAgent: options.userAgent,
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    clean: options.clean ?? false,
  };

  // Create progress reporter
  const progress = new ProgressReporter(cliOptions.quiet ?? false, cliOptions.verbose ?? false);
  progress.start(`Cloning ${url} to ${output}`);

  try {
    // Convert CliOptions to CrawlConfig
    const configBuilder = new CrawlConfigBuilder(cliOptions);
    const crawlConfig = configBuilder.build();

    // Import here to avoid circular dependency
    const { WebEcho } = await import("../main/index.js");
    const webecho = new WebEcho(crawlConfig, progress);

    const result = await webecho.run();

    progress.complete(result);
  } catch (error) {
    progress.error(error as Error);
    process.exit(1);
  }
}

/**
 * Handle the http-clone command (no browser)
 */
async function handleHttpClone(url: string, output: string, options: any): Promise<void> {
  const cliOptions: CliOptions = {
    url,
    output,
    depth: options.depth ? parseInt(options.depth, 10) : undefined,
    maxPages: options.maxPages ? parseInt(options.maxPages, 10) : undefined,
    maxAssets: options.maxAssets ? parseInt(options.maxAssets, 10) : undefined,
    include: options.include ? options.include.split(",") : undefined,
    exclude: options.exclude ? options.exclude.split(",") : undefined,
    skipRobots: options.skipRobots ?? false,
    userAgent: options.userAgent,
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    clean: options.clean ?? false,
  };

  // Create progress reporter
  const progress = new ProgressReporter(cliOptions.quiet ?? false, cliOptions.verbose ?? false);
  progress.start(`HTTP cloning ${url} to ${output}`);

  try {
    // Convert CliOptions to CrawlConfig
    const configBuilder = new CrawlConfigBuilder(cliOptions);
    const crawlConfig = configBuilder.build();

    // Import HTTP crawler
    const { HttpCrawler } = await import("../crawler/http-crawler.js");
    const { checkRobotsTxt } = await import("../crawler/crawler.js");

    // Check robots.txt
    if (crawlConfig.respectRobots) {
      await checkRobotsTxt(crawlConfig.baseUrl, "WebEcho");
    }

    // Run HTTP crawler
    const httpCrawler = new HttpCrawler(crawlConfig);
    const result = await httpCrawler.crawl(crawlConfig.baseUrl);

    progress.complete(result);
  } catch (error) {
    progress.error(error as Error);
    process.exit(1);
  }
}

/**
 * Handle the serve command - start local HTTP server
 */
async function handleServe(directory: string, options: any): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 8080;
  const openBrowser = options.open ?? false;

  // Resolve directory path
  const path = await import("node:path");
  const { existsSync } = await import("node:fs");
  const { resolve } = path;

  const dirPath = resolve(process.cwd(), directory);

  if (!existsSync(dirPath)) {
    console.error(`Error: Directory '${directory}' does not exist`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(50));
  console.log("  WebEcho Local Server");
  console.log("=".repeat(50));
  console.log(`\n  Serving: ${dirPath}`);
  console.log(`  Port:    ${port}`);
  console.log(`\n  URL:     http://localhost:${port}\n`);
  console.log("=".repeat(50));
  console.log("\nPress Ctrl+C to stop\n");

  // Create a simple HTTP server
  const http = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { extname } = path;

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };

  const server = http.createServer(async (req, res) => {
    // Remove query string
    const urlPath = req.url?.split("?")[0] || "/";

    // Default to index.html for directory requests
    let filePath = resolve(dirPath, urlPath.slice(1));

    if (urlPath === "/" || existsSync(filePath) && (await import("node:fs")).statSync(filePath).isDirectory()) {
      filePath = resolve(dirPath, "index.html");
    }

    try {
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      // File not found, try serving as SPA (return index.html)
      try {
        const indexPath = resolve(dirPath, "index.html");
        const data = await readFile(indexPath);
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    }
  });

  server.listen(port, async () => {
    if (openBrowser) {
      const { exec } = await import("node:child_process");
      const url = `http://localhost:${port}`;

      // Open browser based on platform
      switch (process.platform) {
        case "win32":
          exec(`start ${url}`);
          break;
        case "darwin":
          exec(`open ${url}`);
          break;
        default:
          exec(`xdg-open ${url}`);
      }
    }
  });
}

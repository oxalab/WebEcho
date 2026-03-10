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

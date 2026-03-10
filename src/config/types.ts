import normalizeUrlLib from "normalize-url";
import type { AuthConfig, BrowserConfig, AssetType } from "../types/index.js";

export interface CliOptions {
    url: string;
    output: string;

    /**
     * Optional Crawling Limits
     */
    depth?: number;
    maxPages?: number;
    maxAssets?: number;
    concurrency?: number;

    /**
     * Optional Output Control
     */
    format?: "static" | "single-file";
    noAssets?: boolean;
    assetTypes?: AssetType[];

    /**
     * Optional Browser Control
     */
    headless?: boolean;
    timeout?: number;
    waitForSelector?: string;
    waitForIdle?: number;

    /**
     * Optional Authentication
     */
    authType?: "basic" | "bearer" | "cookie" | "form";
    username?: string;
    password?: string;
    token?: string;
    cookies?: string;

    /**
     * Filtering (Optional)
     */
    include?: string[];
    exclude?: string[];
    skipRobots?: boolean;

    /**
     * Other Optionals
     */
    userAgent?: string;
    verbose?: boolean;
    quiet?: boolean;
    clean?: boolean;
}

export interface CrawlConfig {
    /**
     * Source
     */
    baseUrl: string;

    /**
     * Output
     */
    outputDir: string;
    format: "static" | "single-file";

    /**
     * Limits
     */
    maxDepth: number;
    maxPages: number;
    maxAssets: number;
    concurrency: number;

    /**
     * Assets
     */
    captureAssets: boolean;
    assetTypes: Set<AssetType>;

    /**
     * Browser
     */
    browser: BrowserConfig;

    /**
     * Authentication
     */
    auth: AuthConfig;

    /**
     * Filtering
     */
    include: RegExp[];
    exclude: RegExp[];
    respectRobots: boolean;

    /**
     * Behavior
     */
    sameDomainOnly: boolean;
    followRedirects: boolean;
    retryCount: number;
    retryDelay: number;

    /**
     * Output Options
     */
    cleanOutput: boolean;
    preserveStructure: boolean;
    generateManifest: boolean;
    verbose: boolean;
    quiet: boolean;
}

/**
 * Default Values
 */

export const DEFAULT_CRAWL_CONFIG: Partial<CrawlConfig> = {
    format: "static",
    maxDepth: 3,
    maxPages: 100,
    maxAssets: 1000,
    concurrency: 5,
    captureAssets: true,
    assetTypes: new Set(["css", "js", "image", "font"] as AssetType[]),
    browser: {
        headless: true,
        viewport: { width: 1920, height: 1080 },
        timeout: 30000,
        waitForIdle: 500,
    },
    auth: {
        type: "none",
    },
    include: [],
    exclude: [],
    respectRobots: true,
    sameDomainOnly: true,
    followRedirects: true,
    retryCount: 3,
    retryDelay: 1000,
    cleanOutput: false,
    preserveStructure: true,
    generateManifest: true,
    verbose: false,
    quiet: false
}

/**
 * Config Class
 */

export class CrawlConfigBuilder {
    private config: CrawlConfig;

    constructor(options: CliOptions) {
        this.config = this.mergeWithDefaults(options);
    }

    private mergeWithDefaults(options: CliOptions): CrawlConfig {
        return {
            baseUrl: normalizeUrl(options.url),
            outputDir: options.output,
            format: options.format ?? DEFAULT_CRAWL_CONFIG.format!,
            maxDepth: options.depth ?? DEFAULT_CRAWL_CONFIG.maxDepth!,
            maxPages: options.maxPages ?? DEFAULT_CRAWL_CONFIG.maxPages!,
            maxAssets: options.maxAssets ?? DEFAULT_CRAWL_CONFIG.maxAssets!,
            concurrency: options.concurrency ?? DEFAULT_CRAWL_CONFIG.concurrency!,
            captureAssets: options.noAssets === undefined ? DEFAULT_CRAWL_CONFIG.captureAssets! : !options.noAssets,
            assetTypes: new Set(options.assetTypes ?? Array.from(DEFAULT_CRAWL_CONFIG.assetTypes!)),

            // Browser config
            browser: {
                headless: options.headless ?? DEFAULT_CRAWL_CONFIG.browser!.headless!,
                viewport: DEFAULT_CRAWL_CONFIG.browser!.viewport!,
                timeout: options.timeout ?? DEFAULT_CRAWL_CONFIG.browser!.timeout!,
                waitForSelector: options.waitForSelector,
                waitForIdle: options.waitForIdle ?? DEFAULT_CRAWL_CONFIG.browser!.waitForIdle!,
                userAgent: options.userAgent,
            },

            // Auth config
            auth: buildAuthConfig(options),

            // Filters
            include: buildRegexPatterns(options.include ?? []),
            exclude: buildRegexPatterns(options.exclude ?? []),
            respectRobots: options.skipRobots === undefined ? DEFAULT_CRAWL_CONFIG.respectRobots! : !options.skipRobots,

            // Remaining defaults
            sameDomainOnly: DEFAULT_CRAWL_CONFIG.sameDomainOnly!,
            followRedirects: DEFAULT_CRAWL_CONFIG.followRedirects!,
            retryCount: DEFAULT_CRAWL_CONFIG.retryCount!,
            retryDelay: DEFAULT_CRAWL_CONFIG.retryDelay!,
            cleanOutput: options.clean ?? DEFAULT_CRAWL_CONFIG.cleanOutput!,
            preserveStructure: DEFAULT_CRAWL_CONFIG.preserveStructure!,
            generateManifest: DEFAULT_CRAWL_CONFIG.generateManifest!,
            verbose: options.verbose ?? DEFAULT_CRAWL_CONFIG.verbose!,
            quiet: options.quiet ?? DEFAULT_CRAWL_CONFIG.quiet!,

        };
    }

    build(): CrawlConfig {
        return this.config;
    }

    // Builder methods for chaining
    withMaxDepth(depth: number): this {
        this.config.maxDepth = depth;
        return this;
    }

    withMaxPages(pages: number): this {
        this.config.maxPages = pages;
        return this;
    }

    withAssetTypes(types: AssetType[]): this {
        this.config.assetTypes = new Set(types);
        return this;
    }

    withInclude(patterns: string[]): this {
        this.config.include = buildRegexPatterns(patterns);
        return this;
    }

    withExclude(patterns: string[]): this {
        this.config.exclude = buildRegexPatterns(patterns);
        return this;
    }
}


// ==================== Helper Functions ====================

function normalizeUrl(url: string): string {
    // Remove trailing slash, ensure protocol
    return normalizeUrlLib(url, {
        removeTrailingSlash: true,
        forceHttps: true,
        stripHash: true,
    });
}

function buildAuthConfig(options: CliOptions): AuthConfig {
    if (!options.authType) {
        return { type: "none" };
    }

    switch (options.authType) {
        case "basic":
            return {
                type: "basic",
                credentials: {
                    username: options.username,
                    password: options.password,
                },
            };

        case "bearer":
            return {
                type: "bearer",
                credentials: {
                    token: options.token,
                },
            };

        case "cookie":
            return {
                type: "cookie",
                credentials: {
                    cookies: parseCookies(options.cookies ?? ""),
                },
            };

        case "form":
            return {
                type: "form",
                loginUrl: options.url,
                credentials: {
                    username: options.username,
                    password: options.password,
                },
            };

        default:
            return { type: "none" };
    }
}

function parseCookies(cookieString: string): Array<{ name: string; value: string; domain?: string }> {
    // Format: "name1=value1; name2=value2"
    if (!cookieString) return [];

    return cookieString.split(";")
        .map((cookie) => {
            const parts = cookie.trim().split("=");
            const name = parts[0]?.trim();
            const value = parts.slice(1).join("=") ?? "";
            return { name: name ?? "", value };
        })
        .filter((cookie) => cookie.name.length > 0);
}

function buildRegexPatterns(patterns: string[]): RegExp[] {
    return patterns.map((pattern) => {
        // Support glob-style patterns
        const regex = pattern
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
        return new RegExp(`^${regex}$`);
    });
}

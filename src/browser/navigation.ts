import type { SpaNavigationEvent } from "../types";

// ============== SPA Navigation Handler ==================

/**
 * Tracks SPA navigation events during page crawling.
 * 
 * Modern SPAs use history.pushState, router.push(), etc.
 * which dont trigger page reloads. This handler captures
 * those navigations by listening to injected events.
 */

export class SpaNavigationHandler {
    private navigations: SpaNavigationEvent[] = [];

    /**
     * Record a navigation event
     */
    record(event: SpaNavigationEvent): void {
        this.navigations.push(event);
    }

    /**
     * Get all recorder navigation URLs
     */
    getNavigations(): string[] {
        return this.navigations
            .map((n) => n.url)
            .filter((url, index, self) => self.indexOf(url) === index);
    }

    /**
     * Get all navigation events
     */
    getEvents(): SpaNavigationEvent[]{
        return [...this.navigations];
    }

    /**
     * Clear recorded navigations
     */
    clear(): void {
        this.navigations = [];
    }

    /**
     * Get count of navigations by type
     */
    getStats(): Record<string, number> {
        return this.navigations.reduce((acc, nav) => {
            acc[nav.type] = (acc[nav.type] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }
}


// =================== Route Extractor ========================

/**
 * Extracts client-side routes from Javascript code
 * 
 * This helps discover routes defined in a route configs
 * that may not be linked in the HTML
 */
export class RouteExtractor {
    /**
     * Extract routes from common router patterns
     */
    static extractRoutes(html: string, jsContent: string[]): string[] {
        const routes: Set<string> = new Set();

       // React Router v6 pattern
    const reactRouter6 = jsContent.join(" ").match(/path:\s*["']([^"']+)["']/g);
    reactRouter6?.forEach((match) => {
      const path = match.replace(/path:\s*["']([^"']+)["']/, "$1");
      routes.add(path);
    });

    // Vue Router pattern
    const vueRouter = jsContent.join(" ").match(/path:\s*["']([^"']+)["']/g);
    vueRouter?.forEach((match) => {
      const path = match.replace(/path:\s*["']([^"']+)["']/, "$1");
      routes.add(path);
    });

    // Next.js Link pattern
    const nextLinks = html.match(/href=["']([^"']+)["']/g);
    nextLinks?.forEach((match) => {
      const path = match.replace(/href=["']([^"']+)["']/, "$1");
      routes.add(path);
    });

    return Array.from(routes).filter((route) =>
      route.startsWith("/") && !route.startsWith("//")
    );
  }

  /**
   * Extract API endpoints from fetch/xhr calls
   */
  static extractApiEndpoint(jsContent: string[]): string[] {
    const endpoints: Set<string> = new Set();
    const allJs = jsContent.join(" ");
    // Fetch calls
    const fetchCalls = allJs.match(/fetch\(["']([^"']+)["']/g);
    fetchCalls?.forEach((match) => {
      const endpoint = match.replace(/fetch\(["']([^"']+)["']/, "$1");
      endpoints.add(endpoint);
    });

    // Axios calls
    const axiosCalls = allJs.match(/axios\.(get|post|put|delete|patch)\(["']([^"']+)["']/g);
    axiosCalls?.forEach((match) => {
      const endpoint = match.replace(/axios\.\w+\(["']([^"']+)["']/, "$1");
      endpoints.add(endpoint);
    });

    return Array.from(endpoints);
  }
}
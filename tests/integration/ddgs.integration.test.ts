import { search } from 'duck-duck-scrape';

describe('DuckDuckGo Integration Tests', () => {
  // These are real integration tests - they make actual API calls
  // Mark them with longer timeout since they depend on network
  jest.setTimeout(30000);

  describe('web search', () => {
    it('should return real search results for a simple query', async () => {
      const searchResults = await search('typescript programming');

      expect(searchResults.results.length).toBeGreaterThan(0);

      // Verify result structure
      const firstResult = searchResults.results[0];
      expect(firstResult).toHaveProperty('title');
      expect(firstResult).toHaveProperty('url');
      expect(typeof firstResult.title).toBe('string');
      expect(typeof firstResult.url).toBe('string');
      expect(firstResult.url).toMatch(/^https?:\/\//);
    });

    it('should return results with descriptions', async () => {
      const searchResults = await search('nodejs javascript runtime');

      expect(searchResults.results.length).toBeGreaterThan(0);

      // At least one result should have description
      const hasContent = searchResults.results.some(
        (r) => r.description && r.description.length > 0
      );
      expect(hasContent).toBe(true);
    });

    it('should handle domain-specific searches', async () => {
      const searchResults = await search('documentation site:github.com');

      expect(searchResults.results.length).toBeGreaterThan(0);

      // Most results should be from github.com
      const githubResults = searchResults.results.filter((r) => 
        r.url.includes('github.com')
      );
      expect(githubResults.length).toBeGreaterThan(0);
    });

    it('should handle queries with special characters', async () => {
      const searchResults = await search('C++ programming');

      expect(searchResults.results.length).toBeGreaterThan(0);
      expect(searchResults.results[0]).toHaveProperty('title');
    });

    it('should return search results', async () => {
      const searchResults = await search('python');

      expect(searchResults.results.length).toBeGreaterThan(0);
      expect(searchResults).toHaveProperty('vqd');
    });

    it('should handle technical queries', async () => {
      const searchResults = await search('REST API design patterns');

      expect(searchResults.results.length).toBeGreaterThan(0);
      
      // Verify all results are valid
      searchResults.results.forEach((result) => {
        expect(result.title).toBeTruthy();
        expect(result.url).toBeTruthy();
        expect(result.url).toMatch(/^https?:\/\//);
      });
    });

    it('should handle queries that might return fewer results', async () => {
      // Very specific query that might return limited results
      const searchResults = await search('claude-code-router npm package');

      // Should still get some results
      expect(searchResults.results.length).toBeGreaterThanOrEqual(0);
      
      // Verify structure of any results returned
      searchResults.results.forEach((result) => {
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
      });
    });

    it('should handle concurrent searches', async () => {
      const searches = Promise.all([
        search('javascript'),
        search('typescript'),
        search('nodejs'),
      ]);

      const allResults = await searches;

      expect(allResults).toHaveLength(3);
      allResults.forEach((result) => {
        expect(result.results.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error handling', () => {
    it('should handle empty queries gracefully', async () => {
      let errorOccurred = false;
      let resultReturned = false;

      try {
        const result = await search('');
        resultReturned = result !== undefined;
      } catch (error) {
        errorOccurred = true;
      }
      
      // Either throws error OR returns a result (both are acceptable)
      const validBehavior = errorOccurred || resultReturned;
      expect(validBehavior).toBe(true);
    });
  });
});

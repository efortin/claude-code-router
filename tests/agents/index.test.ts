jest.mock('@agentic/searxng', () => ({
  SearxngClient: jest.fn(() => ({ search: jest.fn(() => Promise.resolve({ results: [] })) })),
}));

import { AgentsManager } from '../../src/agents';
import { IAgent } from '../../src/agents/type';

describe('AgentsManager', () => {
  let agentsManager: AgentsManager;
  let mockAgent: IAgent;

  beforeEach(() => {
    agentsManager = new AgentsManager();

    mockAgent = {
      name: 'test-agent',
      tools: new Map([
        [
          'test-tool',
          {
            name: 'test-tool',
            description: 'A test tool',
            input_schema: { type: 'object', properties: {} },
            handler: jest.fn(),
          },
        ],
      ]),
      shouldHandle: jest.fn().mockReturnValue(true),
      reqHandler: jest.fn(),
    };
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      agentsManager.registerAgent(mockAgent);
      const retrievedAgent = agentsManager.getAgent('test-agent');

      expect(retrievedAgent).toBeDefined();
      expect(retrievedAgent?.name).toBe('test-agent');
    });

    it('should allow registering multiple agents', () => {
      const secondAgent: IAgent = {
        ...mockAgent,
        name: 'second-agent',
      };

      agentsManager.registerAgent(mockAgent);
      agentsManager.registerAgent(secondAgent);

      expect(agentsManager.getAllAgents()).toHaveLength(2);
    });
  });

  describe('getAgent', () => {
    it('should retrieve a registered agent by name', () => {
      agentsManager.registerAgent(mockAgent);
      const agent = agentsManager.getAgent('test-agent');

      expect(agent).toBe(mockAgent);
    });

    it('should return undefined for non-existent agent', () => {
      const agent = agentsManager.getAgent('non-existent');

      expect(agent).toBeUndefined();
    });
  });

  describe('getAllAgents', () => {
    it('should return empty array when no agents registered', () => {
      const agents = agentsManager.getAllAgents();

      expect(agents).toEqual([]);
    });

    it('should return all registered agents', () => {
      const secondAgent: IAgent = {
        ...mockAgent,
        name: 'second-agent',
      };

      agentsManager.registerAgent(mockAgent);
      agentsManager.registerAgent(secondAgent);

      const agents = agentsManager.getAllAgents();

      expect(agents).toHaveLength(2);
      expect(agents).toContain(mockAgent);
      expect(agents).toContain(secondAgent);
    });
  });

  describe('getAllTools', () => {
    it('should return empty array when no agents have tools', () => {
      const agentWithoutTools: IAgent = {
        ...mockAgent,
        tools: new Map(),
      };

      agentsManager.registerAgent(agentWithoutTools);
      const tools = agentsManager.getAllTools();

      expect(tools).toEqual([]);
    });

    it('should return all tools from all agents', () => {
      const secondAgent: IAgent = {
        ...mockAgent,
        name: 'second-agent',
        tools: new Map([
          [
            'another-tool',
            {
              name: 'another-tool',
              description: 'Another test tool',
              input_schema: { type: 'object', properties: {} },
              handler: jest.fn(),
            },
          ],
        ]),
      };

      agentsManager.registerAgent(mockAgent);
      agentsManager.registerAgent(secondAgent);

      const tools = agentsManager.getAllTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[1].name).toBe('another-tool');
    });
  });
});

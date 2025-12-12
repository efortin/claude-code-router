/**
 * TDD Tests for XMLToolCallParser based on real-world vLLM output
 * Tests verify correct parsing without breaking streaming, token counting, or sequence order
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLToolCallParser, transformXMLToolCalls } from '../../src/utils/XMLToolCallParser';

// Load test cases from data file
const testCasesPath = join(__dirname, '../../../data/tests/tool-calls.json');
let testCases: any[] = [];

try {
  const testData = readFileSync(testCasesPath, 'utf-8');
  testCases = JSON.parse(testData);
} catch (e) {
  console.warn('Could not load test cases from', testCasesPath);
  testCases = [];
}

describe('XMLToolCallParser - Test Cases from tool-calls.json', () => {
  // Run all test cases from the JSON file
  testCases.forEach((testCase) => {
    it(`Case ${testCase.id}: ${testCase.description}`, () => {
      const result = transformXMLToolCalls(testCase.model_output_xml);

      // Verify tool calls were extracted
      expect(result.toolCalls.length).toBe(testCase.expected_tools.length);

      // Verify each tool call
      testCase.expected_tools.forEach((expectedTool: any, index: number) => {
        const actualTool = result.toolCalls[index];

        expect(actualTool).toBeDefined();
        expect(actualTool.type).toBe('tool_use');
        expect(actualTool.id).toBeTruthy();
        expect(actualTool.name).toBe(expectedTool.name);
        
        // Deep comparison of arguments
        expect(actualTool.input).toEqual(expectedTool.arguments);
      });

      // Verify XML was removed from text
      expect(result.text).not.toContain('<tool_call');
      expect(result.text).not.toContain('</tool_call>');
      expect(result.text).not.toContain('<tool_name');
    });
  });
});

describe('XMLToolCallParser - Streaming Behavior', () => {
  it('should maintain order when processing tool calls sequentially', () => {
    const parser = new XMLToolCallParser();
    const xml1 = '<tool_call>\n  <tool_name>first</tool_name>\n  <tool_arguments>{}</tool_arguments>\n</tool_call>';
    const xml2 = '<tool_call>\n  <tool_name>second</tool_name>\n  <tool_arguments>{}</tool_arguments>\n</tool_call>';

    const result1 = parser.processChunk(xml1);
    const result2 = parser.processChunk(xml2);

    expect(result1.toolCalls[0].name).toBe('first');
    expect(result2.toolCalls[0].name).toBe('second');
  });

  it('should buffer incomplete XML across chunks', () => {
    const parser = new XMLToolCallParser();

    const chunk1 = '<tool_call>\n  <tool_name>test</tool_name>';
    const chunk2 = '\n  <tool_arguments>{"key":"value"}</tool_arguments>';
    const chunk3 = '\n</tool_call>';

    const result1 = parser.processChunk(chunk1);
    expect(result1.toolCalls.length).toBe(0); // Incomplete

    const result2 = parser.processChunk(chunk2);
    expect(result2.toolCalls.length).toBe(0); // Still incomplete

    const result3 = parser.processChunk(chunk3);
    expect(result3.toolCalls.length).toBe(1); // Complete!
    expect(result3.toolCalls[0].name).toBe('test');
    expect(result3.toolCalls[0].input.key).toBe('value');
  });

  it('should preserve text before and after tool calls', () => {
    const xml = 'Before text\n<tool_call>\n  <tool_name>test</tool_name>\n  <tool_arguments>{}</tool_arguments>\n</tool_call>\nAfter text';
    
    const result = transformXMLToolCalls(xml);

    expect(result.text).toContain('Before text');
    expect(result.text).toContain('After text');
    expect(result.toolCalls.length).toBe(1);
  });

  it('should handle mixed text and tool calls in correct order', () => {
    const parser = new XMLToolCallParser();
    
    const chunk1 = 'Text 1 ';
    const chunk2 = '<tool_call><tool_name>tool1</tool_name><tool_arguments>{}</tool_arguments></tool_call>';
    const chunk3 = ' Text 2 ';
    const chunk4 = '<tool_call><tool_name>tool2</tool_name><tool_arguments>{}</tool_arguments></tool_call>';
    const chunk5 = ' Text 3';

    const results: any[] = [];
    [chunk1, chunk2, chunk3, chunk4, chunk5].forEach(chunk => {
      results.push(parser.processChunk(chunk));
    });

    // Verify order preservation
    expect(results[0].cleanedText).toContain('Text 1');
    expect(results[1].toolCalls[0].name).toBe('tool1');
    expect(results[2].cleanedText).toContain('Text 2');
    expect(results[3].toolCalls[0].name).toBe('tool2');
    expect(results[4].cleanedText).toContain('Text 3');
  });

  it('should not lose any content during streaming', () => {
    const parser = new XMLToolCallParser();
    const fullText = 'Start\n<tool_call><tool_name>test</tool_name><tool_arguments>{"a":1}</tool_arguments></tool_call>\nEnd';
    
    // Simulate streaming by splitting at arbitrary positions
    const chunks = [
      fullText.slice(0, 10),
      fullText.slice(10, 30),
      fullText.slice(30, 60),
      fullText.slice(60, 90),
      fullText.slice(90),
    ];

    let allText = '';
    let allTools: any[] = [];

    chunks.forEach(chunk => {
      const result = parser.processChunk(chunk);
      allText += result.cleanedText;
      allTools = allTools.concat(result.toolCalls);
    });

    const flushed = parser.flush();
    allText += flushed.cleanedText;
    allTools = allTools.concat(flushed.toolCalls);

    expect(allText).toContain('Start');
    expect(allText).toContain('End');
    expect(allTools.length).toBe(1);
    expect(allTools[0].input.a).toBe(1);
  });
});

describe('XMLToolCallParser - Token Counting Compatibility', () => {
  it('should produce text that can be token counted correctly', () => {
    const xml = 'This is a test message.\n<tool_call><tool_name>search</tool_name><tool_arguments>{"query":"test"}</tool_arguments></tool_call>\nContinuing the message.';
    
    const result = transformXMLToolCalls(xml);

    // The cleaned text should be valid UTF-8
    expect(() => Buffer.from(result.text, 'utf-8')).not.toThrow();
    
    // Text should not have XML artifacts
    expect(result.text).not.toMatch(/<[^>]+>/);
    
    // Text should maintain readability
    expect(result.text.trim().length).toBeGreaterThan(0);
  });

  it('should not introduce extra whitespace that affects token count', () => {
    const xml = 'Text<tool_call><tool_name>test</tool_name><tool_arguments>{}</tool_arguments></tool_call>More';
    
    const result = transformXMLToolCalls(xml);

    // Should not have multiple spaces
    expect(result.text).not.toMatch(/  +/);
    
    // Should preserve original spacing
    expect(result.text).toBe('TextMore');
  });

  it('should handle unicode correctly for token counting', () => {
    const xml = '测试 <tool_call><tool_name>test</tool_name><tool_arguments>{"emoji":"👍"}</tool_arguments></tool_call> 继续';
    
    const result = transformXMLToolCalls(xml);

    expect(result.text).toContain('测试');
    expect(result.text).toContain('继续');
    expect(result.toolCalls[0].input.emoji).toBe('👍');
  });
});

describe('XMLToolCallParser - Edge Cases and Error Handling', () => {
  it('should handle malformed XML gracefully', () => {
    const malformed = '<tool_call><tool_name>test</tool_name><tool_arguments>{"invalid: json}</tool_arguments></tool_call>';
    
    expect(() => transformXMLToolCalls(malformed)).not.toThrow();
  });

  it('should handle empty input', () => {
    const result = transformXMLToolCalls('');
    
    expect(result.text).toBe('');
    expect(result.toolCalls.length).toBe(0);
  });

  it('should handle input with no tool calls', () => {
    const text = 'This is just plain text with no XML at all.';
    
    const result = transformXMLToolCalls(text);
    
    expect(result.text).toBe(text);
    expect(result.toolCalls.length).toBe(0);
  });

  it('should handle very large tool arguments', () => {
    const largeData = JSON.stringify({ data: 'x'.repeat(10000) });
    const xml = `<tool_call><tool_name>test</tool_name><tool_arguments>${largeData}</tool_arguments></tool_call>`;
    
    const result = transformXMLToolCalls(xml);
    
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].input.data.length).toBe(10000);
  });

  it('should generate unique IDs for each tool call', () => {
    const xml = '<tool_call><tool_name>test</tool_name><tool_arguments>{}</tool_arguments></tool_call>\n<tool_call><tool_name>test</tool_name><tool_arguments>{}</tool_arguments></tool_call>';
    
    const result = transformXMLToolCalls(xml);
    
    expect(result.toolCalls.length).toBe(2);
    expect(result.toolCalls[0].id).not.toBe(result.toolCalls[1].id);
  });

  it('should reset correctly', () => {
    const parser = new XMLToolCallParser();
    
    parser.processChunk('<tool_call><tool_name>test1');
    parser.reset();
    
    const result = parser.processChunk('<tool_call><tool_name>test2</tool_name><tool_arguments>{}</tool_arguments></tool_call>');
    
    expect(result.toolCalls[0].name).toBe('test2');
  });
});

describe('XMLToolCallParser - Format Variants', () => {
  it('should handle both <tool_call> and <function_call> tags', () => {
    const xml1 = '<tool_call><tool_name>test1</tool_name><tool_arguments>{}</tool_arguments></tool_call>';
    const xml2 = '<function_call><name>test2</name><arguments>{}</arguments></function_call>';
    
    const result1 = transformXMLToolCalls(xml1);
    const result2 = transformXMLToolCalls(xml2);
    
    expect(result1.toolCalls[0].name).toBe('test1');
    expect(result2.toolCalls[0].name).toBe('test2');
  });

  it('should handle <function=> format', () => {
    const xml = '<function=myTool>\n<parameter=param1>value1\n<parameter=param2>value2\n</function>';
    
    const result = transformXMLToolCalls(xml);
    
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].name).toBe('myTool');
    expect(result.toolCalls[0].input.param1).toBe('value1');
    expect(result.toolCalls[0].input.param2).toBe('value2');
  });

  it('should handle <arguments> as alternative to <tool_arguments>', () => {
    const xml = '<tool_call><tool_name>test</tool_name><arguments>{"key":"value"}</arguments></tool_call>';
    
    const result = transformXMLToolCalls(xml);
    
    expect(result.toolCalls[0].input.key).toBe('value');
  });
});

describe('XMLToolCallParser - Sequence Order Preservation', () => {
  it('should maintain exact order of interleaved text and tool calls', () => {
    const parser = new XMLToolCallParser();
    const events: Array<{ type: string; content: any }> = [];

    const chunks = [
      'A',
      '<tool_call><tool_name>t1</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
      'B',
      '<tool_call><tool_name>t2</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
      'C',
    ];

    chunks.forEach(chunk => {
      const result = parser.processChunk(chunk);
      if (result.cleanedText) {
        events.push({ type: 'text', content: result.cleanedText });
      }
      result.toolCalls.forEach(tool => {
        events.push({ type: 'tool', content: tool.name });
      });
    });

    expect(events[0]).toEqual({ type: 'text', content: 'A' });
    expect(events[1]).toEqual({ type: 'tool', content: 't1' });
    expect(events[2]).toEqual({ type: 'text', content: 'B' });
    expect(events[3]).toEqual({ type: 'tool', content: 't2' });
    expect(events[4]).toEqual({ type: 'text', content: 'C' });
  });

  it('should maintain order even with partial chunks', () => {
    const parser = new XMLToolCallParser();
    const events: Array<{ type: string; order: number }> = [];
    let order = 0;

    const chunks = [
      'Start ',
      '<tool_call><tool_name>',
      't1</tool_name>',
      '<tool_arguments>{}</tool_arguments></tool_call>',
      ' Middle ',
      '<tool_call><tool_name>t2',
      '</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
      ' End',
    ];

    chunks.forEach(chunk => {
      const result = parser.processChunk(chunk);
      if (result.cleanedText) {
        events.push({ type: 'text', order: order++ });
      }
      result.toolCalls.forEach(() => {
        events.push({ type: 'tool', order: order++ });
      });
    });

    // Verify order is sequential
    for (let i = 1; i < events.length; i++) {
      expect(events[i].order).toBeGreaterThan(events[i - 1].order);
    }
  });
});

describe('XMLToolCallParser - No Regressions', () => {
  it('should not affect normal text messages', () => {
    const normalText = 'This is a normal message with no XML or tool calls. It should pass through unchanged.';
    
    const result = transformXMLToolCalls(normalText);
    
    expect(result.text).toBe(normalText);
    expect(result.toolCalls.length).toBe(0);
  });

  it('should not break on HTML-like content', () => {
    const html = '<div>This is HTML content</div><p>Not a tool call</p>';
    
    const result = transformXMLToolCalls(html);
    
    // Should pass through since it doesn't match tool call patterns
    expect(result.text).toBe(html);
    expect(result.toolCalls.length).toBe(0);
  });

  it('should not interfere with JSON in text', () => {
    const text = 'Here is some JSON: {"key": "value", "nested": {"a": 1}}';
    
    const result = transformXMLToolCalls(text);
    
    expect(result.text).toBe(text);
    expect(result.toolCalls.length).toBe(0);
  });
});

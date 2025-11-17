/**
 * Enhanced XMLToolCallParser - Handles multiple XML tool call formats from vLLM
 * 
 * Supports two main formats:
 * 
 * Format 1 (tool_call/tool_name/tool_arguments):
 *   <tool_call>
 *     <tool_name>search</tool_name>
 *     <tool_arguments>{"query": "test"}</tool_arguments>
 *   </tool_call>
 * 
 * Format 2 (function/parameter):
 *   <function=search>
 *   <parameter=query>test
 *   </function>
 * 
 * Also handles:
 * - <function_call> as alternative to <tool_call>
 * - CDATA sections
 * - XML entity escaping
 * - Nested XML arguments
 * - Namespaced tags
 * - Partial/streaming content
 */

import { XMLParser } from 'fast-xml-parser';

interface ToolCall {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export class XMLToolCallParser {
  private buffer: string = '';
  private toolCallIdCounter: number = 0;
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      cdataPropName: '__cdata',
      parseTagValue: true,
      trimValues: true,
      ignoreDeclaration: true,
      allowBooleanAttributes: true,
      parseAttributeValue: true,
    });
  }

  /**
   * Detect if text contains any XML tool call patterns
   */
  static containsToolCallXML(text: string): boolean {
    return (
      /<tool_call[\s>]/.test(text) ||
      /<function_call[\s>]/.test(text) ||
      /<function=/.test(text) ||
      /<tool_name/.test(text)
    );
  }

  /**
   * Process a chunk of text and extract tool calls
   */
  processChunk(chunk: string): {
    cleanedText: string;
    toolCalls: ToolCall[];
  } {
    this.buffer += chunk;
    const toolCalls: ToolCall[] = [];
    let cleanedText = '';

    // Extract complete tool calls (Format 1: <tool_call> or <function_call>)
    const toolCallRegex = /<(tool_call|function_call)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g;
    let lastIndex = 0;
    let match;

    while ((match = toolCallRegex.exec(this.buffer)) !== null) {
      // Add text before tool call
      cleanedText += this.buffer.substring(lastIndex, match.index);

      try {
        const toolCall = this.parseToolCallXML(match[0]);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
      } catch (e) {
        console.warn('Failed to parse tool call XML:', e);
        // Keep the XML in text if parsing fails
        cleanedText += match[0];
      }

      lastIndex = match.index + match[0].length;
    }

    // Extract Format 2 style (<function=...>)
    const functionRegex = /<function=([^>]+)>([\s\S]*?)<\/function>/g;
    let functionMatch;

    while ((functionMatch = functionRegex.exec(this.buffer)) !== null) {
      if (functionMatch.index >= lastIndex) {
        // Add text before function call
        cleanedText += this.buffer.substring(lastIndex, functionMatch.index);

        try {
          const toolCall = this.parseFunctionCallXML(functionMatch[1], functionMatch[2]);
          if (toolCall) {
            toolCalls.push(toolCall);
          }
        } catch (e) {
          console.warn('Failed to parse function call XML:', e);
          cleanedText += functionMatch[0];
        }

        lastIndex = functionMatch.index + functionMatch[0].length;
      }
    }

    // Handle CDATA wrapped content
    const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
    let cdataMatch;
    let cdataLastIndex = 0;
    let bufferWithoutCDATA = this.buffer;

    while ((cdataMatch = cdataRegex.exec(this.buffer)) !== null) {
      const cdataContent = cdataMatch[1];
      // Process CDATA content recursively
      const result = new XMLToolCallParser().processChunk(cdataContent);
      toolCalls.push(...result.toolCalls);
      // Remove CDATA wrapper
      bufferWithoutCDATA = bufferWithoutCDATA.replace(cdataMatch[0], result.cleanedText);
    }

    if (cdataMatch) {
      this.buffer = bufferWithoutCDATA;
      cleanedText = this.buffer.substring(0, lastIndex);
      this.buffer = this.buffer.substring(lastIndex);
    } else {
      // Add remaining text or buffer incomplete XML
      if (lastIndex < this.buffer.length) {
        const remaining = this.buffer.substring(lastIndex);
        // Check if remaining might be incomplete XML
        if (this.mightBeIncompleteXML(remaining)) {
          this.buffer = remaining;
        } else {
          cleanedText += remaining;
          this.buffer = '';
        }
      } else {
        this.buffer = '';
      }
    }

    return { cleanedText, toolCalls };
  }

  /**
   * Parse tool_call/function_call XML format
   */
  private parseToolCallXML(xml: string): ToolCall | null {
    // Clean up BOM and whitespace
    xml = xml.replace(/^\uFEFF/, '').trim();

    // Strip markdown code fences
    xml = xml.replace(/^```(?:xml)?\n?/, '').replace(/\n?```$/, '');

    try {
      const parsed = this.xmlParser.parse(xml);
      
      // Handle both tool_call and function_call
      const toolData = parsed.tool_call || parsed.function_call;
      if (!toolData) return null;

      // Extract tool name (handle namespaced tags)
      let toolName = toolData.tool_name || toolData.name;
      if (typeof toolName === 'object' && toolName['#text']) {
        toolName = toolName['#text'];
      }
      if (typeof toolName === 'object' && Object.keys(toolName).length > 0) {
        // Handle namespaced tags like <qwen:tool_name>
        const keys = Object.keys(toolName);
        for (const key of keys) {
          if (key.includes('tool_name') || key === '#text') {
            toolName = toolName[key];
            break;
          }
        }
      }
      
      toolName = String(toolName || '').trim();

      // Extract arguments (handle multiple tag names)
      let toolArgs = toolData.tool_arguments || toolData.arguments || toolData.args || {};
      
      // Handle CDATA
      if (toolArgs.__cdata) {
        toolArgs = toolArgs.__cdata;
      }
      if (typeof toolArgs === 'object' && toolArgs['#text']) {
        toolArgs = toolArgs['#text'];
      }

      // Parse arguments
      let parsedArgs: Record<string, any> = {};

      if (typeof toolArgs === 'string') {
        // Decode XML entities
        toolArgs = this.decodeXMLEntities(toolArgs);
        
        // Try to parse as JSON
        toolArgs = toolArgs.trim();
        if (toolArgs.startsWith('{') || toolArgs.startsWith('[')) {
          try {
            parsedArgs = JSON.parse(toolArgs);
          } catch (e) {
            console.warn('Failed to parse tool arguments as JSON:', e);
            parsedArgs = { raw: toolArgs };
          }
        } else if (toolArgs === '') {
          parsedArgs = {};
        } else {
          parsedArgs = { raw: toolArgs };
        }
      } else if (typeof toolArgs === 'object' && toolArgs !== null) {
        // Handle nested XML arguments
        parsedArgs = this.flattenXMLObject(toolArgs);
      }

      return {
        type: 'tool_use',
        id: this.generateToolId(),
        name: toolName,
        input: parsedArgs,
      };
    } catch (e) {
      console.warn('XML parsing error:', e);
      return null;
    }
  }

  /**
   * Parse function=name format
   */
  private parseFunctionCallXML(functionName: string, content: string): ToolCall | null {
    const parameters: Record<string, string> = {};
    
    // Extract parameters
    const paramRegex = /<parameter=([^>]+)>([^<]*)/g;
    let match;
    
    while ((match = paramRegex.exec(content)) !== null) {
      parameters[match[1]] = match[2].trim();
    }

    return {
      type: 'tool_use',
      id: this.generateToolId(),
      name: functionName.trim(),
      input: parameters,
    };
  }

  /**
   * Flatten nested XML object to simple key-value pairs
   */
  private flattenXMLObject(obj: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key of Object.keys(obj)) {
      if (key.startsWith('@_') || key === '#text' || key === '__cdata') {
        continue;
      }

      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (value['@_type'] === 'int') {
          result[key] = parseInt(value['#text'] || value);
        } else if (value['#text'] !== undefined) {
          result[key] = value['#text'];
        } else {
          Object.assign(result, this.flattenXMLObject(value, ''));
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Decode XML entities
   */
  private decodeXMLEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /**
   * Generate unique tool ID
   */
  private generateToolId(): string {
    return `toolu_${Date.now()}_${this.toolCallIdCounter++}`;
  }

  /**
   * Check if text might be incomplete XML
   */
  private mightBeIncompleteXML(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.startsWith('<tool_call') ||
      trimmed.startsWith('<function_call') ||
      trimmed.startsWith('<function=') ||
      (trimmed.includes('<tool_') && !trimmed.includes('</tool_call>')) ||
      (trimmed.includes('<function') && !trimmed.includes('</function>'))
    );
  }

  /**
   * Flush remaining buffer
   */
  flush(): { cleanedText: string; toolCalls: ToolCall[] } {
    const result = {
      cleanedText: this.buffer,
      toolCalls: [] as ToolCall[],
    };
    this.buffer = '';
    return result;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
    this.toolCallIdCounter = 0;
  }
}

/**
 * Quick transformation helper
 */
export function transformXMLToolCalls(text: string): {
  text: string;
  toolCalls: ToolCall[];
} {
  const parser = new XMLToolCallParser();
  const result = parser.processChunk(text);
  const flushed = parser.flush();

  return {
    text: result.cleanedText + flushed.cleanedText,
    toolCalls: [...result.toolCalls, ...flushed.toolCalls],
  };
}

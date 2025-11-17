import { rewriteStream } from '../../utils/rewriteStream';

describe('rewriteStream', () => {
  it('should process and pass through values', async () => {
    const sourceData = ['hello', 'world'];
    const sourceStream = new ReadableStream({
      start(controller) {
        sourceData.forEach(item => controller.enqueue(item));
        controller.close();
      }
    });

    const processor = jest.fn(async (data) => data.toUpperCase());
    const resultStream = rewriteStream(sourceStream, processor);

    const reader = resultStream.getReader();
    const results = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toEqual(['HELLO', 'WORLD']);
    expect(processor).toHaveBeenCalledTimes(2);
  });

  it('should filter out undefined values', async () => {
    const sourceData = ['keep', 'filter', 'keep'];
    const sourceStream = new ReadableStream({
      start(controller) {
        sourceData.forEach(item => controller.enqueue(item));
        controller.close();
      }
    });

    const processor = jest.fn(async (data) => {
      return data === 'filter' ? undefined : data;
    });
    
    const resultStream = rewriteStream(sourceStream, processor);

    const reader = resultStream.getReader();
    const results = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toEqual(['keep', 'keep']);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it('should handle empty streams', async () => {
    const sourceStream = new ReadableStream({
      start(controller) {
        controller.close();
      }
    });

    const processor = jest.fn(async (data) => data);
    const resultStream = rewriteStream(sourceStream, processor);

    const reader = resultStream.getReader();
    const results = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('should handle processor errors', async () => {
    const sourceStream = new ReadableStream({
      start(controller) {
        controller.enqueue('data');
        controller.close();
      }
    });

    const error = new Error('Processing error');
    const processor = jest.fn(async () => {
      throw error;
    });
    
    const resultStream = rewriteStream(sourceStream, processor);
    const reader = resultStream.getReader();

    await expect(reader.read()).rejects.toThrow('Processing error');
  });
});

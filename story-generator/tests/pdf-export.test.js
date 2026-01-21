import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PDFExporter } from '../src/pdf-export.js';

describe('PDFExporter', () => {
  describe('constructor', () => {
    it('should initialize with default options', () => {
      const exporter = new PDFExporter('/path/to/story');

      assert.strictEqual(exporter.storyPath, '/path/to/story');
      assert.strictEqual(exporter.options.includeCharacters, true);
      assert.strictEqual(exporter.options.imageSize, 'medium');
    });

    it('should accept custom options', () => {
      const exporter = new PDFExporter('/path/to/story', {
        includeCharacters: false,
        imageSize: 'large'
      });

      assert.strictEqual(exporter.options.includeCharacters, false);
      assert.strictEqual(exporter.options.imageSize, 'large');
    });

    it('should set image dimensions based on size option', () => {
      const smallExporter = new PDFExporter('/path', { imageSize: 'small' });
      const mediumExporter = new PDFExporter('/path', { imageSize: 'medium' });
      const largeExporter = new PDFExporter('/path', { imageSize: 'large' });

      assert.strictEqual(smallExporter.imageDimensions.width, 80);
      assert.strictEqual(mediumExporter.imageDimensions.width, 120);
      assert.strictEqual(largeExporter.imageDimensions.width, 180);
    });

    it('should default to medium size for invalid size option', () => {
      const exporter = new PDFExporter('/path', { imageSize: 'invalid' });

      assert.strictEqual(exporter.imageDimensions.width, 120);
      assert.strictEqual(exporter.imageDimensions.height, 120);
    });
  });

  describe('generate', () => {
    it('should throw error when state file not found', async () => {
      const exporter = new PDFExporter('/nonexistent/path');

      await assert.rejects(
        async () => exporter.generate(),
        { message: /Story state file not found/ }
      );
    });
  });
});

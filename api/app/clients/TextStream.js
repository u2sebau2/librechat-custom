const { Readable } = require('stream');
const { logger } = require('~/config');

class TextStream extends Readable {
  constructor(text, options = {}) {
    super(options);
    this.text = text;
    this.currentIndex = 0;
    // Increased chunk sizes for smoother streaming with less overhead
    this.minChunkSize = options.minChunkSize ?? 10;  // Was 2, now sends more text per chunk
    this.maxChunkSize = options.maxChunkSize ?? 20;  // Was 4, reduces number of operations
    this.delay = options.delay ?? 5; // Reduced from 20ms to 5ms for faster streaming
  }

  _read() {
    const { delay, minChunkSize, maxChunkSize } = this;

    if (this.currentIndex < this.text.length) {
      setTimeout(() => {
        const remainingChars = this.text.length - this.currentIndex;
        const chunkSize = Math.min(this.randomInt(minChunkSize, maxChunkSize + 1), remainingChars);

        const chunk = this.text.slice(this.currentIndex, this.currentIndex + chunkSize);
        this.push(chunk);
        this.currentIndex += chunkSize;
      }, delay);
    } else {
      this.push(null); // signal end of data
    }
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  async processTextStream(onProgressCallback) {
    const streamPromise = new Promise((resolve, reject) => {
      this.on('data', (chunk) => {
        onProgressCallback(chunk.toString());
      });

      this.on('end', () => {
        // logger.debug('[processTextStream] Stream ended');
        resolve();
      });

      this.on('error', (err) => {
        reject(err);
      });
    });

    try {
      await streamPromise;
    } catch (err) {
      logger.error('[processTextStream] Error in text stream:', err);
      // Handle the error appropriately, e.g., return an error message or throw an error
    }
  }
}

module.exports = TextStream;

function setHeaders(req, res, next) {
  res.writeHead(200, {
    'Connection': 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
    // Additional headers for better streaming performance
    'Transfer-Encoding': 'chunked',
    'Content-Encoding': 'identity',
  });
  // Flush headers immediately to start streaming
  res.flushHeaders();
  next();
}

module.exports = setHeaders;

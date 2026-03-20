exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hasBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
      nodeVersion: process.version,
      envKeys: Object.keys(process.env).filter(k => k.startsWith('NETLIFY')).sort(),
    }),
  };
};

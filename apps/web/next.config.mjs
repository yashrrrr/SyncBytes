/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.STANDALONE === 'true' ? 'standalone' : undefined,
  reactStrictMode: true,
  transpilePackages: ['@syncbytes/crdt', '@excalidraw/excalidraw'],
};

export default nextConfig;

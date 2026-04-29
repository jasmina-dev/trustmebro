/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gzip/brotli responses at the edge — every API payload is JSON and
  // compresses ~90%, so the network cost drops by an order of magnitude.
  compress: true,
  experimental: {
    optimizePackageImports: ["lodash", "date-fns", "recharts"],
  },
};

module.exports = nextConfig;

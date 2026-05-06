/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizePackageImports: ["lodash", "date-fns", "recharts"],
  },
};

module.exports = nextConfig;

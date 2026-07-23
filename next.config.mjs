/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Route handlers use Node crypto; keep them on the Node runtime.
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  // Crawlee resolves modules and reads config at runtime, which does not survive
  // bundling. Loading it from node_modules keeps the scraper provider working.
  serverExternalPackages: ['@crawlee/cheerio'],
}

export default nextConfig

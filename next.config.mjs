/** @type {import("next").NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === "1";
const basePath = isGithubPages ? "/edger" : "";

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;

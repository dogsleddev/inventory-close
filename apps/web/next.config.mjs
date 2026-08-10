/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The @icg/* workspace packages export TypeScript source with NodeNext
  // ".js" import specifiers; transpile them and map ".js" → ".ts" so
  // webpack resolves the same way tsc does.
  transpilePackages: [
    "@icg/services",
    "@icg/data",
    "@icg/domain",
    "@icg/rules",
    "@icg/evidence",
    "@icg/permissions",
    "@icg/workflows",
    "@icg/audit",
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;

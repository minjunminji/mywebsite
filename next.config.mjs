/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg'),
    );

    if (fileLoaderRule) {
      config.module.rules.push(
        {
          ...fileLoaderRule,
          test: /\\.svg$/i,
          resourceQuery: /url/,
        },
        {
          test: /\\.svg$/i,
          issuer: fileLoaderRule.issuer,
          resourceQuery: {
            not: [...(fileLoaderRule.resourceQuery?.not || []), /url/],
          },
          use: ['@svgr/webpack'],
        },
      );

      fileLoaderRule.exclude = /\\.svg$/i;
    }

    return config;
  },
};

export default nextConfig;
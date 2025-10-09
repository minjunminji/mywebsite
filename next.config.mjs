/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use webpack so we can enable SVGR for inline SVG components
  webpack: (config) => {
    // Enable importing SVGs as React components, e.g. import Icon from './icon.svg'
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: "@svgr/webpack",
          options: {
            // Keep viewBox so our SVG scales correctly
            svgoConfig: {
              plugins: [{ name: "removeViewBox", active: false }],
            },
            // Forward refs so we can attach refs to the root SVG element
            ref: true,
          },
        },
      ],
    });

    return config;
  },
};

export default nextConfig;

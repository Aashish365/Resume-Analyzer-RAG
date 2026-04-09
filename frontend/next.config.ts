import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Enable webpack file-system polling so HMR works inside Docker on Windows/Mac.
  // Native inotify events don't propagate from the host through Docker Desktop volume
  // mounts, so polling is required. Only active in development.
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 500,            // check for changes every 500 ms
        aggregateTimeout: 300, // debounce rebuild by 300 ms after a change
      };
    }
    return config;
  },
};

export default nextConfig;

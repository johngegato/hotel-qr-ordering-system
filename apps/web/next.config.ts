import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.1.102',
    '192.168.1.102:3000',
    '192.168.1.*',
    '192.168.0.*',
    '10.0.0.*',
    '*.local',
  ],
};

export default nextConfig;

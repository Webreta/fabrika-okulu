import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["web-push", "postgres", "bcryptjs", "nodemailer", "qrcode"],
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    serverActions: {
      // Kurs dosyaları / ödev yüklemeleri için
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

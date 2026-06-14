import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Cần thiết để build Docker image siêu nhẹ

  // Next.js Server nhận request tại cổng 3333 và đóng vai trò như một Proxy trung gian, âm thầm gửi request sang API Gateway (ở cổng 3000). Trình duyệt hoàn toàn không biết việc chuyển tiếp này.
  // => Vì thế, Backend có thể tắt hoàn toàn cấu hình CORS, vì giao tiếp thực tế diễn ra giữa Server-to-Server (Node.js <-> NestJS).
  // Có ENV => Linh hoạt về cổng chạy của Next.js
  async rewrites() {
    const gatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:3000";
    return [
      {
        source: "/api/users/:path*",
        destination: `${gatewayUrl}/api/users/:path*`,
      },
      {
        source: "/api/identity/:path*",
        destination: `${gatewayUrl}/api/identity/:path*`,
      },
      {
        source: "/api/files/:path*",
        destination: `${gatewayUrl}/api/files/:path*`,
      },
      {
        source: "/api/transcripts/:path*",
        destination: `${gatewayUrl}/api/transcripts/:path*`,
      },
      {
        source: "/api/meetings/:path*",
        destination: `${gatewayUrl}/api/v1/meetings/:path*`,
      },
    ];
  },
};

export default nextConfig;

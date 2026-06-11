/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',           // Docker 최적화: 필요한 파일만 포함
  experimental: {
    instrumentationHook: true,    // 자동 수집 스케줄러 활성화
  },
  serverExternalPackages: ['node-cron'],
};

module.exports = nextConfig;

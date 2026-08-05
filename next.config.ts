import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16は `next dev` のたびにCLAUDE.mdへ独自ルールを追記しようとする
  // (agentRules機能)。このリポジトリのCLAUDE.mdは自前で管理しているため無効化する。
  agentRules: false,
};

export default nextConfig;

export type TechBadgeCategory = 'runtime' | 'data' | 'messaging' | 'infra';

export interface TechBadgeDef {
  id: string;
  label: string;
  short: string;
  category: TechBadgeCategory;
  aliases: string[];
  /** Brand accent color for SVG export & inline styles */
  hex: string;
  /** Light tint background for SVG export */
  svgBg: string;
}

export const TECH_BADGE_CATEGORIES: Array<{ id: TechBadgeCategory; label: string }> = [
  { id: 'runtime', label: '语言 / 运行时' },
  { id: 'data', label: '存储 / 缓存' },
  { id: 'messaging', label: '消息 / 协议' },
  { id: 'infra', label: '云原生 / 观测' },
];

export const TECH_BADGES: TechBadgeDef[] = [
  // Runtime & Languages
  {
    id: 'go',
    label: 'Go',
    short: 'Go',
    category: 'runtime',
    aliases: ['go', 'golang'],
    hex: '#00add8',
    svgBg: 'rgba(0,173,216,0.18)',
  },
  {
    id: 'rust',
    label: 'Rust',
    short: 'RS',
    category: 'runtime',
    aliases: ['rust', 'tokio', 'axum', 'actix'],
    hex: '#f97316',
    svgBg: 'rgba(249,115,22,0.18)',
  },
  {
    id: 'java',
    label: 'Java',
    short: 'JVM',
    category: 'runtime',
    aliases: ['java', 'spring', 'springboot', 'kotlin', 'jvm'],
    hex: '#fb923c',
    svgBg: 'rgba(251,146,60,0.18)',
  },
  {
    id: 'node',
    label: 'Node.js',
    short: 'Node',
    category: 'runtime',
    aliases: ['node', 'nodejs', 'node.js', 'nestjs', 'express'],
    hex: '#4ade80',
    svgBg: 'rgba(74,222,128,0.18)',
  },
  {
    id: 'ts',
    label: 'TypeScript',
    short: 'TS',
    category: 'runtime',
    aliases: ['ts', 'typescript', 'react', 'nextjs', 'next.js', 'vue'],
    hex: '#38bdf8',
    svgBg: 'rgba(56,189,248,0.18)',
  },
  {
    id: 'python',
    label: 'Python',
    short: 'Py',
    category: 'runtime',
    aliases: ['python', 'py', 'fastapi', 'django', 'pytorch'],
    hex: '#facc15',
    svgBg: 'rgba(250,204,21,0.18)',
  },

  // Data & Storage
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    short: 'PG',
    category: 'data',
    aliases: ['postgres', 'postgresql', 'pg', 'pgsql'],
    hex: '#60a5fa',
    svgBg: 'rgba(96,165,250,0.18)',
  },
  {
    id: 'mysql',
    label: 'MySQL',
    short: 'MySQL',
    category: 'data',
    aliases: ['mysql', 'innodb', 'tidb', 'mariadb'],
    hex: '#38bdf8',
    svgBg: 'rgba(56,189,248,0.18)',
  },
  {
    id: 'redis',
    label: 'Redis',
    short: 'Redis',
    category: 'data',
    aliases: ['redis', 'valkey', 'dragonfly'],
    hex: '#f43f5e',
    svgBg: 'rgba(244,63,94,0.18)',
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    short: 'Mongo',
    category: 'data',
    aliases: ['mongo', 'mongodb'],
    hex: '#22c55e',
    svgBg: 'rgba(34,197,94,0.18)',
  },
  {
    id: 'elasticsearch',
    label: 'Elasticsearch',
    short: 'ES',
    category: 'data',
    aliases: ['es', 'elasticsearch', 'opensearch'],
    hex: '#eab308',
    svgBg: 'rgba(234,179,8,0.18)',
  },
  {
    id: 'clickhouse',
    label: 'ClickHouse',
    short: 'CH',
    category: 'data',
    aliases: ['clickhouse', 'ch', 'doris', 'starrocks'],
    hex: '#fbbf24',
    svgBg: 'rgba(251,191,36,0.18)',
  },
  {
    id: 's3',
    label: 'S3 / OSS',
    short: 'S3',
    category: 'data',
    aliases: ['s3', 'oss', 'minio', 'cos'],
    hex: '#f59e0b',
    svgBg: 'rgba(245,158,11,0.18)',
  },

  // Messaging & Protocols
  {
    id: 'kafka',
    label: 'Kafka',
    short: 'Kafka',
    category: 'messaging',
    aliases: ['kafka', 'pulsar', 'rocketmq', 'redpanda'],
    hex: '#a78bfa',
    svgBg: 'rgba(167,139,250,0.18)',
  },
  {
    id: 'rabbitmq',
    label: 'RabbitMQ',
    short: 'RMQ',
    category: 'messaging',
    aliases: ['rabbitmq', 'rmq', 'amqp', 'nats'],
    hex: '#fb923c',
    svgBg: 'rgba(251,146,60,0.18)',
  },
  {
    id: 'grpc',
    label: 'gRPC',
    short: 'gRPC',
    category: 'messaging',
    aliases: ['grpc', 'protobuf', 'rpc', 'thrift'],
    hex: '#2dd4bf',
    svgBg: 'rgba(45,212,191,0.18)',
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    short: 'GQL',
    category: 'messaging',
    aliases: ['graphql', 'gql'],
    hex: '#ec4899',
    svgBg: 'rgba(236,72,153,0.18)',
  },
  {
    id: 'nginx',
    label: 'Nginx',
    short: 'Nginx',
    category: 'messaging',
    aliases: ['nginx', 'openresty', 'apisix', 'kong', 'envoy'],
    hex: '#10b981',
    svgBg: 'rgba(16,185,129,0.18)',
  },

  // Cloud Native & Observability
  {
    id: 'k8s',
    label: 'Kubernetes',
    short: 'K8s',
    category: 'infra',
    aliases: ['k8s', 'kubernetes', 'istio', 'helm'],
    hex: '#3b82f6',
    svgBg: 'rgba(59,130,246,0.18)',
  },
  {
    id: 'docker',
    label: 'Docker',
    short: 'Docker',
    category: 'infra',
    aliases: ['docker', 'containerd'],
    hex: '#0ea5e9',
    svgBg: 'rgba(14,165,233,0.18)',
  },
  {
    id: 'etcd',
    label: 'Etcd / Raft',
    short: 'Etcd',
    category: 'infra',
    aliases: ['etcd', 'raft', 'consul', 'zookeeper', 'nacos'],
    hex: '#818cf8',
    svgBg: 'rgba(129,140,248,0.18)',
  },
  {
    id: 'prometheus',
    label: 'Prometheus',
    short: 'Prom',
    category: 'infra',
    aliases: ['prometheus', 'grafana', 'otel', 'opentelemetry', 'jaeger'],
    hex: '#f87171',
    svgBg: 'rgba(248,113,113,0.18)',
  },
  {
    id: 'flink',
    label: 'Flink / Spark',
    short: 'Flink',
    category: 'infra',
    aliases: ['flink', 'spark'],
    hex: '#e879f9',
    svgBg: 'rgba(232,121,249,0.18)',
  },
  {
    id: 'aws',
    label: 'AWS / Cloud',
    short: 'Cloud',
    category: 'infra',
    aliases: ['aws', 'gcp', 'azure', 'aliyun', 'cloudflare'],
    hex: '#f59e0b',
    svgBg: 'rgba(245,158,11,0.18)',
  },
];

export interface ResolvedTechPart {
  raw: string;
  badge?: TechBadgeDef;
}

/**
 * Split a free-form `node.tech` string (e.g. "Go / gRPC", "PostgreSQL 16", "Redis Cluster")
 * into color-coded badges and fallback text chips.
 */
export function resolveTechBadges(tech?: string): ResolvedTechPart[] {
  if (!tech || !tech.trim()) return [];
  const segments = tech
    .split(/[\/,+·|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seenBadgeIds = new Set<string>();
  const results: ResolvedTechPart[] = [];

  for (const seg of segments) {
    const tokens = seg
      .toLowerCase()
      .split(/[\s()_-]+/)
      .filter(Boolean);
    let matched: TechBadgeDef | undefined;

    for (const def of TECH_BADGES) {
      if (
        def.aliases.some((alias) => tokens.includes(alias) || seg.toLowerCase() === alias)
      ) {
        matched = def;
        break;
      }
    }

    if (matched) {
      if (!seenBadgeIds.has(matched.id)) {
        seenBadgeIds.add(matched.id);
        results.push({ raw: seg, badge: matched });
      }
    } else {
      results.push({ raw: seg });
    }
  }

  return results;
}

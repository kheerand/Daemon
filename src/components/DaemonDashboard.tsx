import { useState, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Compass,
  BookMarked,
  Film,
  TrendingUp,
  Settings,
  Clock,
  Briefcase,
  Server,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

/**
 * Daemon Data Interface
 * Matches the schema from daemon-mcp/schema/daemon.types.ts
 * NO placeholder data - only what the API provides
 */
interface DaemonData {
  // Core Identity
  about?: string;
  mission?: string;
  telos?: string | string[];
  current_location?: string;

  // Preferences
  preferences?: string[];
  daily_routine?: string[];

  // Collections
  favorite_books?: string[];
  favorite_movies?: string[];
  favorite_podcasts?: string[];
  predictions?: string[];

  // Projects
  projects?: {
    technical?: string[];
    creative?: string[];
    personal?: string[];
  };

  // Metadata
  last_updated?: string;
  sync_status?: {
    daemon_md?: string;
  };
}

/**
 * Error Boundary for graceful error handling
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 rounded-lg border border-error/30 bg-error/10">
          <p className="text-sm text-error">Failed to render section</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Safe text renderer - handles undefined/null gracefully
 */
function SafeText({ text, fallback = 'Not available' }: { text?: string; fallback?: string }) {
  return <>{text || fallback}</>;
}

/**
 * Safe list renderer - handles undefined/null/empty arrays
 */
function SafeList({
  items,
  fallback = 'No items available',
  renderItem = (item: string, i: number) => (
    <p key={i} className="text-sm text-text-secondary">{item}</p>
  )
}: {
  items?: string[];
  fallback?: string;
  renderItem?: (item: string, index: number) => ReactNode;
}) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-text-tertiary italic">{fallback}</p>;
  }
  return <>{items.map(renderItem)}</>;
}

function StatusBar({
  isConnected,
  toolCount,
  currentTime,
  lastUpdated
}: {
  isConnected: boolean;
  toolCount: number;
  currentTime: Date;
  lastUpdated?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm px-4 py-3 mb-6"
    >
      <div className="flex items-center gap-4">
        <span className="font-mono font-bold text-sm text-accent">DAEMON://KHEERAN</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse-slow' : 'bg-error'}`} />
          <span className="font-mono text-xs text-text-secondary">
            {isConnected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-text-tertiary font-mono text-xs">
        <span>{toolCount} endpoints</span>
        {lastUpdated && <span>Updated: {new Date(lastUpdated).toLocaleDateString()}</span>}
        <span>{currentTime.toISOString().slice(0, 10)}</span>
      </div>
    </motion.div>
  );
}

export function DaemonDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [daemonData, setDaemonData] = useState<DaemonData>({});
  const [toolCount, setToolCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    fetchDaemonData();
    return () => clearInterval(timer);
  }, []);

  async function fetchDaemonData() {
    setLoading(true);
    setError(null);

    try {
      const toolsResponse = await fetch('https://daemon.kheerand.id.au', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
      });

      if (toolsResponse.ok) {
        const toolsData = await toolsResponse.json();
        setToolCount(toolsData.result?.tools?.length || 0);
      }

      const dataResponse = await fetch('https://daemon.kheerand.id.au', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'get_all', arguments: {} },
          id: 2
        })
      });

      if (dataResponse.ok) {
        const response = await dataResponse.json();
        if (response.result?.content?.[0]?.text) {
          const data = JSON.parse(response.result.content[0].text);
          setDaemonData(data);
          setIsConnected(true);
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        throw new Error(`HTTP ${dataResponse.status}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Connection failed: ${message}`);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }

  function extractTelosId(item: string): string {
    const match = item.match(/^([PMG]\d+)/);
    return match ? match[1] : '??';
  }

  function extractTelosText(item: string): string {
    return item.replace(/^[PMG]\d+:\s*/, '');
  }

  // Parse telos - can be string or array
  function getTelosItems(): string[] {
    if (!daemonData.telos) return [];
    if (Array.isArray(daemonData.telos)) return daemonData.telos;
    // If it's a string, split by newlines (backward compat)
    return daemonData.telos.split('\n').filter(Boolean);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
          <p className="font-mono text-sm text-text-secondary">Establishing MCP connection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertCircle className="w-8 h-8 text-error" />
          <p className="font-mono text-sm text-error">{error}</p>
          <button
            onClick={fetchDaemonData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-mono text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const telosItems = getTelosItems();

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-4">
      <StatusBar
        isConnected={isConnected}
        toolCount={toolCount}
        currentTime={currentTime}
        lastUpdated={daemonData.last_updated}
      />

      {/* TIER 1: Core Purpose - 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mission */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-72"
          >
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Target className="w-5 h-5 text-accent" />
              <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Mission</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <p className="font-body text-base text-text-secondary leading-relaxed pb-3">
                <SafeText text={daemonData.mission} fallback="Mission not available" />
              </p>
            </div>
          </motion.div>
        </ErrorBoundary>

        {/* TELOS */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-72"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-accent" />
                <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">TELOS Framework</span>
              </div>
              <a href="/telos" className="text-sm text-brand hover:underline">View all</a>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                {telosItems.length > 0 ? (
                  telosItems.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="font-mono font-bold text-accent shrink-0">{extractTelosId(item)}</span>
                      <span className="text-text-secondary">{extractTelosText(item)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-tertiary italic">TELOS not available</p>
                )}
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>
      </div>

      {/* TIER 2: Recommendations - 3 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Books */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-text-tertiary" />
                <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Books</span>
              </div>
              <span className="text-xs text-text-tertiary">{daemonData.favorite_books?.length || 0}</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList items={daemonData.favorite_books} fallback="No books listed" />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>

        {/* Movies */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-text-tertiary" />
                <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Movies</span>
              </div>
              <span className="text-xs text-text-tertiary">{daemonData.favorite_movies?.length || 0}</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList items={daemonData.favorite_movies} fallback="No movies listed" />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>

        {/* Predictions */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-xl border border-border-default bg-bg-secondary/80 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-text-tertiary" />
                <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Predictions</span>
              </div>
              <span className="text-xs text-text-tertiary">{daemonData.predictions?.length || 0}</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList items={daemonData.predictions} fallback="No predictions listed" />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>
      </div>

      {/* TIER 3: Context - 3 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Preferences */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl border border-border-subtle bg-bg-secondary/60 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Settings className="w-5 h-5 text-text-tertiary" />
              <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Preferences</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList
                  items={daemonData.preferences}
                  fallback="No preferences listed"
                  renderItem={(pref, i) => (
                    <p key={i} className="text-sm text-text-tertiary">{pref}</p>
                  )}
                />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>

        {/* Daily Routine */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-border-subtle bg-bg-secondary/60 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-text-tertiary" />
                <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Routine</span>
              </div>
              <span className="text-xs text-text-tertiary">{daemonData.daily_routine?.length || 0}</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList
                  items={daemonData.daily_routine}
                  fallback="No routine listed"
                  renderItem={(item, i) => (
                    <p key={i} className="text-sm text-text-tertiary">{item}</p>
                  )}
                />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>

        {/* Projects */}
        <ErrorBoundary>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-xl border border-border-subtle bg-bg-secondary/60 backdrop-blur-sm pt-5 px-5 pb-2 flex flex-col max-h-64"
          >
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Briefcase className="w-5 h-5 text-text-tertiary" />
              <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">Projects</span>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="space-y-2 pb-3">
                <SafeList
                  items={daemonData.projects?.technical}
                  fallback="No projects listed"
                  renderItem={(proj, i) => (
                    <p key={i} className="text-sm text-text-tertiary">{proj}</p>
                  )}
                />
              </div>
            </div>
          </motion.div>
        </ErrorBoundary>
      </div>

      {/* TIER 4: API Access - Centered Footer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="flex justify-center pt-4"
      >
        <div className="rounded-xl border border-border-subtle bg-bg-tertiary/50 backdrop-blur-sm p-6 max-w-md w-full text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Server className="w-5 h-5 text-text-tertiary" />
            <span className="font-mono text-sm font-semibold tracking-wider text-text-tertiary uppercase">API Access</span>
          </div>
          <code className="font-mono text-base text-brand block mb-3">daemon.kheerand.id.au</code>
          <p className="text-sm text-text-tertiary mb-4">Connect your AI assistant directly</p>
          <a
            href="/api/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-secondary hover:bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle transition-colors text-sm font-mono"
          >
            View API Docs <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </motion.div>
    </div>
  );
}

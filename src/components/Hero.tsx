import { motion } from 'framer-motion';
import { Terminal, Zap, Globe, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Hero() {
  const [location, setLocation] = useState('Loading...');

  useEffect(() => {
    async function fetchLocation() {
      try {
        const response = await fetch('/daemon.md');
        const text = await response.text();
        const match = text.match(/\[CURRENT_LOCATION\]\s*\n\s*(.+)/);
        if (match) {
          setLocation(match[1].trim());
        }
      } catch {
        setLocation('Melbourne, Australia');
      }
    }
    fetchLocation();
  }, []);
  return (
    <section className="relative pt-28 pb-6 px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Title + Badge inline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-4 mb-3"
        >
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight">
            <span className="text-gradient">DAEMON</span>
          </h1>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
            <span className="font-mono text-xs text-brand">LIVE</span>
          </div>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-heading text-lg text-text-secondary mb-3"
        >
          Personal MCP API for{' '}
          <a href="https://cytrax.com.au" className="text-brand hover:underline">
            Kheeran Dharmawardena
          </a>
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="font-body text-lg text-text-secondary max-w-2xl mx-auto mb-5"
        >
          My vision of the future where technology's primary role is to enable human connection. Daemons are live views into what a person is doing and what they care about for the purpose of connecting with others with similar interests.
        </motion.p>

        {/* Location */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex justify-center mb-3"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/30">
            <MapPin className="w-3.5 h-3.5 text-brand" />
            <span className="font-mono text-xs text-brand">{location}</span>
          </div>
        </motion.div>

        {/* Feature Pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle">
            <Terminal className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="font-mono text-xs text-text-secondary">MCP</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle">
            <Zap className="w-3.5 h-3.5 text-success" />
            <span className="font-mono text-xs text-text-secondary">Real-time</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle">
            <Globe className="w-3.5 h-3.5 text-accent" />
            <span className="font-mono text-xs text-text-secondary">Public</span>
          </div>
          <a
            href="/api/"
            className="px-4 py-1.5 rounded-lg font-heading font-medium text-xs bg-bg-secondary hover:bg-bg-tertiary text-text-secondary border border-border-subtle transition-all duration-300"
          >
            API Docs
          </a>
        </motion.div>
      </div>
    </section>
  );
}

# Agent Guide: Daemon Project

## Build / Lint / Test Commands

```bash
bun run dev          # Start dev server (port 5177)
bun run build        # Build for production
bun run preview      # Preview production build
bun install          # Install dependencies (NEVER use npm/yarn/pnpm)
bun test             # Run all tests (when tests exist)
bun test <path>      # Run specific test file
```

**Note:** No test suite currently exists. If you add tests, use `bun test` syntax.

## Stack & Technology

- **Runtime:** Bun exclusively (NOT Node.js, npm, pnpm, or vite)
- **Framework:** Astro (static site) + React + TypeScript
- **Styling:** Tailwind CSS v4 + Framer Motion (animations) + Lucide React (icons)
- **Deployment:** Cloudflare Pages with optional MCP Worker

## Code Style Guidelines

### Imports
```typescript
// External libs first, then local
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Component } from './OtherComponent';
```

### Naming Conventions
- **Components:** `PascalCase` - `DaemonDashboard`, `StatusBar`
- **Functions:** `camelCase` - `fetchDaemonData`, `extractTelosId`
- **Constants:** `SCREAMING_SNAKE_CASE` - `TOOLS`, `LIST_SECTIONS`
- **Interfaces:** `PascalCase` - `DaemonData`, `ErrorBoundaryProps`

### Type Safety
- TypeScript strict mode enforced by Astro config
- Always annotate function params and return types
- Define interfaces for complex data structures

```typescript
interface DaemonData {
  about?: string;
  mission?: string;
  telos?: string | string[];
  last_updated?: string;
}

async function fetchDaemonData(): Promise<void> {
  // Implementation
}
```

### Error Handling
```typescript
try {
  const response = await fetch(url);
  const data = await response.json();
  setData(data);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  setError(`Connection failed: ${message}`);
}
```

### React Patterns
- Functional components with hooks (not class components)
- Error Boundaries for graceful component failure
- Loading and error states for async operations
- Framer Motion for all animations

```typescript
function SafeText({ text, fallback = 'Not available' }: { text?: string; fallback?: string }) {
  return <>{text || fallback}</>;
}

<ErrorBoundary>
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    Content
  </motion.div>
</ErrorBoundary>
```

### Styling
- Tailwind utility classes (no custom CSS)
- Responsive: `md:`, `lg:` prefixes
- Semantic color tokens from design system
- Motion via Framer Motion, not CSS

```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  className="rounded-xl border border-border-default bg-bg-secondary/80 p-4"
>
  Content
</motion.div>
```

### File Organization
- `src/components/` - React components
- `src/layouts/` - Astro layouts
- `src/pages/` - Astro pages
- `src/worker.ts` - Cloudflare Worker (MCP server)
- `public/daemon.md` - Source of truth for daemon data

## Cursor Rules Summary
- Use Bun exclusively (not Node.js, npm, pnpm, vite)
- Prefer native Bun APIs: `Bun.serve()`, `Bun.file()`, `bun:sqlite`
- Bun auto-loads `.env` files
- `bun test` for testing (when added)

## Project-Specific Notes

### Daemon Data Format
`public/daemon.md` uses section-based markdown:
```
[ABOUT]
Your bio here

[MISSION]
Your mission

[FAVORITE_BOOKS]
- Book 1
- Book 2
```

### MCP Integration
Dashboard fetches data via JSON-RPC from MCP endpoint. `src/worker.ts` defines tools and parses `daemon.md`.

### Deployment
- Static site to Cloudflare Pages
- Optional: MCP server as separate Cloudflare Worker
- Build output: `dist/` directory

## Common Patterns

**Data Fetching with Error Handling:**
```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

async function fetchData() {
  try {
    setLoading(true);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setData(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setLoading(false);
  }
}
```

**Safe Array Rendering:**
```typescript
function SafeList({ items, fallback = 'No items' }: { items?: string[]; fallback?: string }) {
  if (!items || items.length === 0) return <p>{fallback}</p>;
  return items.map((item, i) => <p key={i}>{item}</p>);
}
```

## Testing (TODO)
No tests exist yet. When adding:
- Use `bun test` syntax with pattern matching
- Test components and parsing functions
- Mock fetch calls
- Test error boundaries and edge cases

import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

const assetManifest = JSON.parse(manifestJSON);

// MCP Tool definitions
const TOOLS = [
  { name: 'get_about', description: "Get Kheeran's about/bio information" },
  { name: 'get_narrative', description: "Get Kheeran's current personal narrative" },
  { name: 'get_mission', description: "Get Kheeran's mission statement" },
  { name: 'get_projects', description: "Get Kheeran's current projects" },
  { name: 'get_telos', description: "Get Kheeran's telos (ultimate goals/purpose)" },
  { name: 'get_favorite_books', description: "Get Kheeran's favorite books" },
  { name: 'get_favorite_movies', description: "Get Kheeran's favorite movies" },
  { name: 'get_current_location', description: "Get Kheeran's current location" },
  { name: 'get_preferences', description: "Get Kheeran's preferences and interests" },
  { name: 'get_daily_routine', description: "Get Kheeran's daily routine" },
  { name: 'get_predictions', description: "Get Kheeran's predictions about AI and the future" },
  { name: 'get_all', description: 'Get all daemon information' },
  {
    name: 'get_section',
    description: 'Get any section by name (e.g., favorite_podcasts, daily_routine)',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'Section name to retrieve (lowercase, underscores for spaces)',
        },
      },
      required: ['section'],
    },
  },
];

// Parse daemon.md content into sections
function parseDaemonData(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const sectionRegex = /\[([A-Z_]+)\]\s*\n([\s\S]*?)(?=\n\[|$)/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].toLowerCase();
    const sectionContent = match[2].trim();
    sections[sectionName] = sectionContent;
  }

  return sections;
}

// Sections that should be parsed as arrays (markdown lists)
const LIST_SECTIONS = [
  'favorite_books',
  'favorite_movies',
  'favorite_podcasts',
  'predictions',
  'preferences',
  'daily_routine',
];

// Parse markdown list into array
function parseMarkdownList(content: string): string[] {
  if (!content) return [];
  return content
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

// Parse telos section - extract P/M/G items
function parseTelosItems(content: string): string[] {
  if (!content) return [];
  return content
    .split('\n')
    .filter(line => /^-\s*[PMG]\d+:/.test(line.trim()))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

// Parse structured data for dashboard consumption
function parseStructuredData(sections: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sections)) {
    if (LIST_SECTIONS.includes(key)) {
      result[key] = parseMarkdownList(value);
    } else if (key === 'telos') {
      // Parse telos to extract P/M/G items as array
      result[key] = parseTelosItems(value);
    } else if (key === 'projects') {
      // Parse projects into categories
      const projects: { technical?: string[]; creative?: string[]; personal?: string[] } = {};
      const lines = value.split('\n');
      let currentCategory: 'technical' | 'creative' | 'personal' | null = null;

      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.includes('technical')) {
          currentCategory = 'technical';
          projects.technical = [];
        } else if (trimmed.includes('creative')) {
          currentCategory = 'creative';
          projects.creative = [];
        } else if (trimmed.includes('personal')) {
          currentCategory = 'personal';
          projects.personal = [];
        } else if (currentCategory && line.trim().startsWith('-')) {
          const item = line.replace(/^-\s*/, '').trim();
          if (item) projects[currentCategory]?.push(item);
        }
      }

      // If no categories found, treat all as technical
      if (!projects.technical && !projects.creative && !projects.personal) {
        projects.technical = parseMarkdownList(value);
      }

      result[key] = projects;
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Map tool names to section names
const toolToSection: Record<string, string> = {
  get_about: 'about',
  get_narrative: 'narrative',
  get_mission: 'mission',
  get_projects: 'projects',
  get_telos: 'telos',
  get_favorite_books: 'favorite_books',
  get_favorite_movies: 'favorite_movies',
  get_current_location: 'current_location',
  get_preferences: 'preferences',
  get_daily_routine: 'daily_routine',
  get_predictions: 'predictions',
};

// Fetch daemon.md from static assets
async function getDaemonContent(request: Request, env: any, ctx: any): Promise<string> {
  const daemonUrl = new URL(request.url);
  daemonUrl.pathname = '/daemon.md';

  const daemonRequest = new Request(daemonUrl.toString(), {
    method: 'GET',
  });

  try {
    const response = await getAssetFromKV(
      {
        request: daemonRequest,
        waitUntil: ctx.waitUntil.bind(ctx),
      },
      {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: assetManifest,
      }
    );
    return await response.text();
  } catch {
    return '';
  }
}

// Handle MCP JSON-RPC requests
async function handleMcpRequest(
  request: Request,
  env: any,
  ctx: any
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json() as {
      jsonrpc: string;
      method: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
      id: number | string;
    };

    const { jsonrpc, method, params, id } = body;

    if (jsonrpc !== '2.0') {
      return jsonRpcError(-32600, 'Invalid Request', id, corsHeaders);
    }

    // Handle tools/list
    if (method === 'tools/list') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: { tools: TOOLS },
          id,
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Handle tools/call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (!toolName) {
        return jsonRpcError(-32602, 'Invalid params: missing tool name', id, corsHeaders);
      }

      const daemonContent = await getDaemonContent(request, env, ctx);
      const sections = parseDaemonData(daemonContent);

      let result: string;

      if (toolName === 'get_all') {
        const structuredData = parseStructuredData(sections);
        result = JSON.stringify(structuredData, null, 2);
      } else if (toolName === 'get_section') {
        const sectionName = (args.section as string)?.toLowerCase();
        if (!sectionName) {
          return jsonRpcError(-32602, 'Invalid params: missing section name', id, corsHeaders);
        }
        result = sections[sectionName] || `Section '${sectionName}' not found`;
      } else if (toolToSection[toolName]) {
        const sectionName = toolToSection[toolName];
        result = sections[sectionName] || `Section '${sectionName}' not found`;
      } else {
        return jsonRpcError(-32601, `Unknown tool: ${toolName}`, id, corsHeaders);
      }

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: result }],
          },
          id,
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    return jsonRpcError(-32601, 'Method not found', id, corsHeaders);
  } catch (e) {
    return jsonRpcError(-32700, 'Parse error', null, corsHeaders);
  }
}

function jsonRpcError(
  code: number,
  message: string,
  id: number | string | null,
  headers: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
    }
  );
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Handle MCP requests (POST to root or /mcp)
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/mcp')) {
      return handleMcpRequest(request, env, ctx);
    }

    // Handle CORS for MCP endpoints
    if (request.method === 'OPTIONS' && (url.pathname === '/' || url.pathname === '/mcp')) {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Serve static assets for GET requests
    try {
      return await getAssetFromKV(
        {
          request,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: assetManifest,
        }
      );
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  },
};

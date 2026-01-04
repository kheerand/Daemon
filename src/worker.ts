import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

const assetManifest = JSON.parse(manifestJSON);

// Access level types
type AccessLevel = 'public' | 'restricted' | 'private';

interface ContentBlock {
  content: string;
  accessLevel: AccessLevel | 'inherited';
}

interface ParsedSection {
  name: string;
  defaultAccessLevel?: AccessLevel;
  content: ContentBlock[];
}

// MCP Tool definitions
const TOOLS = [
  { name: 'get_about', description: "Get Kheeran's about/bio information", accessLevel: 'public' as AccessLevel },
  { name: 'get_narrative', description: "Get Kheeran's current personal narrative", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_mission', description: "Get Kheeran's mission statement", accessLevel: 'public' as AccessLevel },
  { name: 'get_projects', description: "Get Kheeran's current projects", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_telos', description: "Get Kheeran's telos (ultimate goals/purpose)", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_favorite_books', description: "Get Kheeran's favorite books", accessLevel: 'public' as AccessLevel },
  { name: 'get_favorite_movies', description: "Get Kheeran's favorite movies", accessLevel: 'public' as AccessLevel },
  { name: 'get_current_location', description: "Get Kheeran's current location", accessLevel: 'public' as AccessLevel },
  { name: 'get_preferences', description: "Get Kheeran's preferences and interests", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_daily_routine', description: "Get Kheeran's daily routine", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_predictions', description: "Get Kheeran's predictions about AI and the future", accessLevel: 'restricted' as AccessLevel },
  { name: 'get_favorite_podcasts', description: "Get Kheeran's favorite podcasts", accessLevel: 'public' as AccessLevel },
  { name: 'get_personal_contacts', description: "Get Kheeran's contact information", accessLevel: 'private' as AccessLevel },
  { name: 'get_family_details', description: "Get Kheeran's family information", accessLevel: 'private' as AccessLevel },
  { name: 'get_mico_instructions', description: "Get Mico-specific instructions", accessLevel: 'private' as AccessLevel },
  { name: 'get_all', description: 'Get all daemon information (filtered by access level)', accessLevel: 'public' as AccessLevel },
  {
    name: 'get_section',
    description: 'Get any section by name (e.g., favorite_podcasts, daily_routine)',
    accessLevel: 'public' as AccessLevel,
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

// Parse daemon data with access levels
function parseDaemonDataWithAccess(content: string): Record<string, ParsedSection> {
  const sections: Record<string, ParsedSection> = {};

  // Parse sections: [SECTION_NAME] @level
  const sectionRegex = /\[([A-Z_]+)\](?:\s*@(\w+))?\s*\n([\s\S]*?)(?=\n\[|$)/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].toLowerCase();
    const defaultAccessLevel = match[2] ? (match[2].toLowerCase() as AccessLevel) : 'public';
    const sectionContent = match[3].trim();

    // Parse content blocks within section
    const contentBlocks = parseContentBlocks(sectionContent);

    sections[sectionName] = {
      name: sectionName,
      defaultAccessLevel,
      content: contentBlocks,
    };
  }

  return sections;
}

// Parse content blocks: @level
function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Split by access level markers (@public, @restricted, @private)
  const parts = content.split(/\n@(public|restricted|private)\s*\n/);

  // First part (before any @level marker) inherits section's default
  if (parts.length > 0 && parts[0].trim()) {
    blocks.push({
      content: parts[0].trim(),
      accessLevel: 'inherited',
    });
  }

  // Parse explicit @level markers
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      const accessLevel = parts[i] as AccessLevel;
      const content = parts[i + 1].trim();

      if (content) {
        blocks.push({
          content,
          accessLevel,
        });
      }
    }
  }

  return blocks;
}

// Check if user can access content at a given level
function isAccessible(contentLevel: AccessLevel, userLevel: AccessLevel): boolean {
  const levelOrder: AccessLevel[] = ['public', 'restricted', 'private'];
  const contentIndex = levelOrder.indexOf(contentLevel);
  const userIndex = levelOrder.indexOf(userLevel);

  return userIndex >= contentIndex;
}

// Resolve content block's effective access level
function resolveContentAccessLevel(
  blockAccessLevel: AccessLevel | 'inherited',
  sectionDefaultLevel: AccessLevel
): AccessLevel {
  if (blockAccessLevel === 'inherited') {
    return sectionDefaultLevel;
  }
  return blockAccessLevel;
}

// Filter section content by access level
function filterSectionContent(
  section: ParsedSection,
  userLevel: AccessLevel
): string {
  const accessibleBlocks: string[] = [];

  for (const block of section.content) {
    const effectiveLevel = resolveContentAccessLevel(
      block.accessLevel,
      section.defaultAccessLevel || 'public'
    );

    if (isAccessible(effectiveLevel, userLevel)) {
      accessibleBlocks.push(block.content);
    }
  }

  return accessibleBlocks.join('\n\n');
}

// Get user's access level from request
function getAccessLevel(request: Request, env: any): AccessLevel {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return 'public';
  }

  // Extract token from "Bearer <token>" format
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Check private token first (highest access)
  if (env.PRIVATE_TOKEN && token === env.PRIVATE_TOKEN) {
    return 'private';
  }

  // Check restricted token
  if (env.RESTRICTED_TOKEN && token === env.RESTRICTED_TOKEN) {
    return 'restricted';
  }

  // Invalid token = public access (no error, graceful degradation)
  return 'public';
}

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

// Load daemon data filtered by access level
async function loadDaemonData(
  accessLevel: AccessLevel,
  request: Request,
  env: any,
  ctx: any
): Promise<Record<string, string>> {
  const content = await getDaemonContent(request, env, ctx);
  const sections = parseDaemonDataWithAccess(content);

  const filteredSections: Record<string, string> = {};

  for (const [key, section] of Object.entries(sections)) {
    const filteredContent = filterSectionContent(section, accessLevel);

    // Only include section if it has accessible content
    if (filteredContent.trim()) {
      filteredSections[key] = filteredContent;
    }
  }

  return filteredSections;
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
  get_favorite_podcasts: 'favorite_podcasts',
  get_personal_contacts: 'personal_contacts',
  get_family_details: 'family_details',
  get_mico_instructions: 'mico_instructions',
};

// Handle MCP JSON-RPC requests
async function handleMcpRequest(
  request: Request,
  env: any,
  ctx: any
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    // Handle initialize (required by MCP clients)
    if (method === 'initialize') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'daemon',
              version: '2.0.0',
            },
          },
          id,
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Handle notifications/initialized (MCP client confirms initialization)
    if (method === 'notifications/initialized') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: {},
          id,
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Get user's access level
    const userAccessLevel = getAccessLevel(request, env);

    // Handle tools/list - filter by access level
    if (method === 'tools/list') {
      const accessibleTools = TOOLS.filter(tool =>
        isAccessible(tool.accessLevel || 'public', userAccessLevel)
      );

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          result: { tools: accessibleTools },
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

      // Check if tool exists and is accessible
      const tool = TOOLS.find(t => t.name === toolName);
      if (!tool) {
        return jsonRpcError(-32601, `Unknown tool: ${toolName}`, id, corsHeaders);
      }

      if (!isAccessible(tool.accessLevel || 'public', userAccessLevel)) {
        return jsonRpcError(
          -32603,
          `Access denied: ${toolName} requires ${tool.accessLevel} access`,
          id,
          corsHeaders
        );
      }

      // Load data with access filtering
      const sections = await loadDaemonData(userAccessLevel, request, env, ctx);

      let result: string;

      if (toolName === 'get_all') {
        const structuredData = parseStructuredData(sections);
        result = JSON.stringify(structuredData, null, 2);
      } else if (toolName === 'get_section') {
        const sectionName = (args.section as string)?.toLowerCase();
        if (!sectionName) {
          return jsonRpcError(-32602, 'Invalid params: missing section name', id, corsHeaders);
        }
        result = sections[sectionName] || `Section '${sectionName}' not found or not accessible`;
      } else if (toolToSection[toolName]) {
        const sectionName = toolToSection[toolName];
        result = sections[sectionName] || `Section '${sectionName}' not found or not accessible`;
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

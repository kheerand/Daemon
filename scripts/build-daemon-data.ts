#!/usr/bin/env bun
/**
 * Build Daemon Data
 *
 * Copies the PKM Kheeran.md file to public/daemon.md with validation.
 * This ensures the daemon data is built from the single source of truth.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Access level type
type AccessLevel = 'public' | 'restricted' | 'private' | 'inherited';

interface ContentBlock {
  content: string;
  accessLevel: AccessLevel;
}

interface ParsedSection {
  name: string;
  defaultAccessLevel?: AccessLevel;
  content: ContentBlock[];
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse daemon data with access levels
function parseDaemonDataWithAccess(content: string): Record<string, ParsedSection> {
  const sections: Record<string, ParsedSection> = {};

  // Parse sections: [SECTION_NAME] @level
  const sectionRegex = /\[([A-Z_]+)\](?:\s*@(\w+))?\s*\n([\s\S]*?)(?=\n\[|$)/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].toLowerCase();
    const defaultAccessLevel = match[2] ? (match[2].toLowerCase() as AccessLevel) : undefined;
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

// Validate access format
function validateAccessFormat(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for invalid access levels in section headers
  const sectionLevelRegex = /\[([A-Z_]+)\]\s*@(\w+)/g;
  let match;

  while ((match = sectionLevelRegex.exec(content)) !== null) {
    const accessLevel = match[2];
    if (!['public', 'restricted', 'private'].includes(accessLevel)) {
      errors.push(`Section "${match[1]}" has invalid access level: @${accessLevel}`);
    }
  }

  // Check for invalid access levels in content
  const contentLevelRegex = /@(\w+)\s*\n/g;

  while ((match = contentLevelRegex.exec(content)) !== null) {
    const accessLevel = match[1];
    if (!['public', 'restricted', 'private'].includes(accessLevel)) {
      errors.push(`Invalid content access level: @${accessLevel}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// CRITICAL: Validate content security
function validateContentSecurity(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sections = parseDaemonDataWithAccess(content);

  const levelOrder: AccessLevel[] = ['public', 'restricted', 'private'];

  for (const [sectionName, section] of Object.entries(sections)) {
    const sectionLevel = section.defaultAccessLevel;

    if (!sectionLevel) {
      // Section has no access level, skip validation (defaults to @public)
      continue;
    }

    const sectionLevelValue = levelOrder.indexOf(sectionLevel);

    // Validate each content block
    for (const block of section.content) {
      if (block.accessLevel === 'inherited') {
        // Inherits section level - always valid
        continue;
      }

      const blockLevelValue = levelOrder.indexOf(block.accessLevel);

      // CRITICAL CHECK: Content must be equal to or MORE restrictive than section
      if (blockLevelValue < sectionLevelValue) {
        errors.push(
          `SECURITY VIOLATION: Section [${sectionName.toUpperCase()}] is @${sectionLevel}, ` +
          `but contains @${block.accessLevel} content (less restrictive). ` +
          `Content must be @${sectionLevel} or higher.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Main build function
async function buildDaemonData(): Promise<boolean> {
  const PKM_PATH = join(homedir(), 'Dropbox', 'PKM', 'Databases', 'People', 'Kheeran.md');
  const OUTPUT_PATH = join(process.cwd(), 'public', 'daemon.md');

  try {
    log('Building daemon data from PKM...', 'blue');
    log(`Source: ${PKM_PATH}`, 'blue');
    log(`Target: ${OUTPUT_PATH}`, 'blue');
    console.log('');

    // Read PKM file
    const content = await readFile(PKM_PATH, 'utf-8');
    log('✓ PKM file read successfully', 'green');

    // Validate format
    const formatValidation = validateAccessFormat(content);
    if (!formatValidation.valid) {
      log('✗ Format validation errors:', 'red');
      formatValidation.errors.forEach(err => log(`  - ${err}`, 'red'));
      return false;
    }
    log('✓ Format validation passed', 'green');

    // CRITICAL: Validate security (content level vs section level)
    const securityValidation = validateContentSecurity(content);
    if (!securityValidation.valid) {
      log('✗ SECURITY VALIDATION FAILED:', 'red');
      securityValidation.errors.forEach(err => log(`  🚨 ${err}`, 'red'));
      console.log('');
      log('SECURITY RULE:', 'yellow');
      log('  Content within a section must have a security level equal to or', 'yellow');
      log('  MORE RESTRICTIVE than the section\'s classification.', 'yellow');
      console.log('');
      log('This prevents accidental exposure of sensitive data in less-restrictive sections.', 'yellow');
      return false;
    }
    log('✓ Security validation passed', 'green');

    // Ensure public directory exists
    await mkdir(join(process.cwd(), 'public'), { recursive: true });

    // Write to output
    await writeFile(OUTPUT_PATH, content, 'utf-8');
    log('✓ Daemon data built successfully', 'green');

    // Summary
    console.log('');
    log('Build Summary:', 'bold');
    const sections = parseDaemonDataWithAccess(content);
    const sectionCount = Object.keys(sections).length;
    log(`  Sections: ${sectionCount}`, 'blue');

    // Count access levels
    const publicSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'public').length;
    const restrictedSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'restricted').length;
    const privateSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'private').length;

    log(`  Public sections: ${publicSections}`, 'blue');
    log(`  Restricted sections: ${restrictedSections}`, 'blue');
    log(`  Private sections: ${privateSections}`, 'blue');

    return true;
  } catch (error) {
    log('✗ Build failed:', 'red');
    log(`  ${error}`, 'red');
    return false;
  }
}

// Run build
const success = await buildDaemonData();
process.exit(success ? 0 : 1);

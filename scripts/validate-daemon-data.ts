#!/usr/bin/env bun
/**
 * Validate Daemon Data
 *
 * Validates the PKM Kheeran.md file for correct access level format and security.
 */

import { readFile } from 'node:fs/promises';
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

  const sectionRegex = /\[([A-Z_]+)\](?:\s*@(\w+))?\s*\n([\s\S]*?)(?=\n\[|$)/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].toLowerCase();
    const defaultAccessLevel = match[2] ? (match[2].toLowerCase() as AccessLevel) : undefined;
    const sectionContent = match[3].trim();

    const contentBlocks = parseContentBlocks(sectionContent);

    sections[sectionName] = {
      name: sectionName,
      defaultAccessLevel,
      content: contentBlocks,
    };
  }

  return sections;
}

function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  const parts = content.split(/\n@(public|restricted|private)\s*\n/);

  if (parts.length > 0 && parts[0].trim()) {
    blocks.push({
      content: parts[0].trim(),
      accessLevel: 'inherited',
    });
  }

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

function validateAccessFormat(content: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for sections without access level metadata (warning)
  const noSectionLevelRegex = /\[([A-Z_]+)\](?!\s*@\w)/g;
  let match;

  while ((match = noSectionLevelRegex.exec(content)) !== null) {
    warnings.push(`Section "${match[1]}" has no default access level (will default to @public)`);
  }

  // Check for invalid access levels in section headers
  const sectionLevelRegex = /\[([A-Z_]+)\]\s*@(\w+)/g;

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
    warnings,
  };
}

function validateContentSecurity(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sections = parseDaemonDataWithAccess(content);

  const levelOrder: AccessLevel[] = ['public', 'restricted', 'private'];

  for (const [sectionName, section] of Object.entries(sections)) {
    const sectionLevel = section.defaultAccessLevel;

    if (!sectionLevel) {
      continue;
    }

    const sectionLevelValue = levelOrder.indexOf(sectionLevel);

    for (const block of section.content) {
      if (block.accessLevel === 'inherited') {
        continue;
      }

      const blockLevelValue = levelOrder.indexOf(block.accessLevel);

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

async function validateDaemonData(): Promise<boolean> {
  const PKM_PATH = join(homedir(), 'Dropbox', 'PKM', 'Databases', 'People', 'Kheeran.md');

  try {
    log('Validating daemon data...', 'blue');
    log(`File: ${PKM_PATH}`, 'blue');
    console.log('');

    const content = await readFile(PKM_PATH, 'utf-8');
    log('✓ File read successfully', 'green');

    // Validate format
    const formatValidation = validateAccessFormat(content);

    if (formatValidation.warnings.length > 0) {
      log('⚠ Format warnings:', 'yellow');
      formatValidation.warnings.forEach(warn => log(`  - ${warn}`, 'yellow'));
    }

    if (!formatValidation.valid) {
      log('✗ Format validation errors:', 'red');
      formatValidation.errors.forEach(err => log(`  - ${err}`, 'red'));
      return false;
    }
    log('✓ Format validation passed', 'green');

    // Validate security
    const securityValidation = validateContentSecurity(content);
    if (!securityValidation.valid) {
      log('✗ SECURITY VALIDATION FAILED:', 'red');
      securityValidation.errors.forEach(err => log(`  🚨 ${err}`, 'red'));
      console.log('');
      log('SECURITY RULE:', 'yellow');
      log('  Content within a section must have a security level equal to or', 'yellow');
      log('  MORE RESTRICTIVE than the section\'s classification.', 'yellow');
      return false;
    }
    log('✓ Security validation passed', 'green');

    // Summary
    console.log('');
    log('Validation Summary:', 'bold');
    const sections = parseDaemonDataWithAccess(content);
    const sectionCount = Object.keys(sections).length;
    log(`  Total sections: ${sectionCount}`, 'blue');

    const publicSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'public').length;
    const restrictedSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'restricted').length;
    const privateSections = Object.values(sections).filter(s => s.defaultAccessLevel === 'private').length;

    log(`  Public sections: ${publicSections}`, 'blue');
    log(`  Restricted sections: ${restrictedSections}`, 'blue');
    log(`  Private sections: ${privateSections}`, 'blue');

    console.log('');
    log('✓ All validation checks passed!', 'green');
    return true;
  } catch (error) {
    log('✗ Validation failed:', 'red');
    log(`  ${error}`, 'red');
    return false;
  }
}

const success = await validateDaemonData();
process.exit(success ? 0 : 1);

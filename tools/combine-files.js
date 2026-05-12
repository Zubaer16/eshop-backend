const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const outputFile = path.join(__dirname, 'eshop-backend-export.txt');
const projectName = 'EShop Backend';

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.claude', '.kilo', 'dist', 'tools'
]);
const EXCLUDE_FILES = new Set([
  '.env', 'package-lock.json', 'eshop-backend.txt', 'combine-files.js'
]);

function shouldExclude(name) {
  return EXCLUDE_FILES.has(name);
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') return 'Documentation';
  if (ext === '.log') return 'Log';
  return 'Source File';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(2) + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
}

function getAllFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (shouldExclude(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function buildTree(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }

  const filtered = entries.filter(e =>
    !EXCLUDE_DIRS.has(e.name) && !shouldExclude(e.name)
  );

  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  let tree = '';
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    tree += prefix + connector + entry.name + '\n';

    if (entry.isDirectory()) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      tree += buildTree(path.join(dir, entry.name), childPrefix);
    }
  }
  return tree;
}

function escapeTreeSymbols(text) {
  return text;
}

function buildOutput() {
  const allFiles = getAllFiles(projectDir).sort();
  const lines = [];

  // Header
  const now = new Date().toISOString();
  lines.push(`# 📁 ${projectName} - Combined Source (For LLM Use)`);
  lines.push(`Generated: ${now}`);
  lines.push(`Project: ${projectName}`);
  lines.push('');
  lines.push('');

  // Tree section
  lines.push('=========================================');
  lines.push('📂 PROJECT FOLDER STRUCTURE');
  lines.push('=========================================');
  lines.push('');
  lines.push(buildTree(projectDir).trimEnd());
  lines.push('');
  lines.push('');

  // Source files section
  lines.push('=========================================');
  lines.push('📦 SOURCE FILES');
  lines.push('=========================================');
  lines.push('');
  lines.push('');

  for (const file of allFiles) {
    const relativePath = path.relative(projectDir, file);
    const stats = fs.statSync(file);
    const content = fs.readFileSync(file, 'utf-8');
    const fileType = getFileType(file);
    const sizeStr = formatSize(stats.size);

    lines.push('============================================================');
    lines.push(`===== FILE START: ${relativePath}`);
    lines.push(`Type: ${fileType}`);
    lines.push(`Size: ${sizeStr}`);
    lines.push('============================================================');
    lines.push('');
    lines.push(content);
    lines.push('');
    lines.push('===== END FILE =====');
    lines.push('');
    lines.push('');
  }

  fs.writeFileSync(outputFile, lines.join('\n'), 'utf-8');
  console.log(`Done. Output written to ${outputFile}`);
}

buildOutput();

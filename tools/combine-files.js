/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * combine-files.js (EShop Backend Version)
 *
 * Full-code export with:
 *  - All essential backend code files
 *  - All important setup/config files
 *  - Clean directory tree structure
 *  - Binary-safe reads
 *  - LLM-optimized clean formatting
 *
 * Output: eshop-backend-export.txt
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "../");
const outputFile = path.join(__dirname, "eshop-backend-export.txt");

const allowedExtensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".env.example",
    ".prisma"
];

const excludedFolders = [
    "node_modules",
    "dist",
    "build",
    ".git",
    ".claude",
    ".kilo",
    "coverage",
    "test",
    "tests",
    "__tests__",
    ".pnpm-store",
    "out",
    ".next",
    ".turbo",
    "tools"
];

const excludedFiles = [
    ".DS_Store",
    "thumbs.db",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    "eshop-backend.txt",
    "eshop-backend-export.txt",
    "combine-files.js"
];

function isBinary(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        return buffer.includes(0);
    } catch {
        return true;
    }
}

function getAllFiles(dir, fileList = []) {
    let files;

    try {
        files = fs.readdirSync(dir);
    } catch {
        return fileList;
    }

    for (const filename of files) {
        const fullPath = path.join(dir, filename);
        const relative = path.relative(projectRoot, fullPath);

        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch {
            continue;
        }

        if (stat.isDirectory()) {
            if (excludedFolders.some(folder => relative === folder || relative.startsWith(folder + path.sep))) {
                continue;
            }

            getAllFiles(fullPath, fileList);
            continue;
        }

        if (excludedFiles.includes(filename)) continue;

        const ext = path.extname(filename).toLowerCase();

        const alwaysIncludeFiles = [
            "tsconfig.json",
            "jsconfig.json",
            "package.json",
            ".eslintrc.js",
            ".eslintrc.json",
            "eslint.config.js",
            ".prettierrc",
            ".prettierrc.json",
            "prettier.config.js",
            "docker-compose.yml",
            "Dockerfile",
            "README.md",
            ".env.example",
            "next.config.js",
            "next.config.ts",
            "vite.config.js",
            "vite.config.ts",
            "tailwind.config.js",
            "tailwind.config.ts",
            "postcss.config.js",
            "postcss.config.cjs"
        ];

        const isAlwaysIncluded = alwaysIncludeFiles.includes(filename);

        if (allowedExtensions.includes(ext) || isAlwaysIncluded) {
            if (!isBinary(fullPath)) {
                fileList.push({
                    path: fullPath,
                    relative
                });
            }
        }
    }

    return fileList;
}

function generateTree(dir, prefix = "") {
    let files;

    try {
        files = fs.readdirSync(dir);
    } catch {
        return "";
    }

    files = files.filter(file => {
        const fullPath = path.join(dir, file);
        const relative = path.relative(projectRoot, fullPath);

        if (excludedFiles.includes(file)) return false;
        if (excludedFolders.some(folder => relative === folder || relative.startsWith(folder + path.sep))) {
            return false;
        }

        return true;
    });

    files.sort((a, b) => {
        const aPath = path.join(dir, a);
        const bPath = path.join(dir, b);
        const aIsDir = fs.statSync(aPath).isDirectory();
        const bIsDir = fs.statSync(bPath).isDirectory();

        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
    });

    let tree = "";

    files.forEach((file, index) => {
        const fullPath = path.join(dir, file);
        const isLast = index === files.length - 1;
        const connector = isLast ? "└── " : "├── ";

        tree += `${prefix}${connector}${file}\n`;

        if (fs.statSync(fullPath).isDirectory()) {
            tree += generateTree(
                fullPath,
                prefix + (isLast ? "    " : "│   ")
            );
        }
    });

    return tree;
}

function detectType(filepath) {
    const normalized = filepath.replace(/\\/g, "/").toLowerCase();

    if (normalized.includes("/modules/")) return "Domain Module";
    if (normalized.includes("/infrastructure/")) return "Infrastructure Layer";
    if (normalized.includes("/shared/")) return "Shared Utilities";
    if (normalized.includes("middleware")) return "Middleware";
    if (normalized.includes("schema.prisma")) return "Database Schema";
    if (normalized.includes("config")) return "Config File";
    if (normalized.endsWith(".md")) return "Documentation";
    if (normalized.includes("container.ts")) return "DI Container";
    if (normalized.includes("server.ts")) return "Entry Point";
    if (normalized.includes("app.ts")) return "App Entry";
    if (normalized.includes("index.ts") || normalized.includes("index.js")) return "Index File";
    if (normalized.includes("route.ts") || normalized.includes("routes")) return "Routes";
    if (normalized.includes("controller")) return "Controller";
    if (normalized.includes("service")) return "Service";
    if (normalized.includes("repository")) return "Repository";
    if (normalized.includes("model")) return "Model";
    if (normalized.includes("schema")) return "Schema";
    if (normalized.includes("dto")) return "DTO";
    if (normalized.includes("validator")) return "Validator";

    return "Source File";
}

function run() {
    console.log("📦 Generating full EShop Backend code export...");

    let content = `# 📁 EShop Backend - Combined Source (For LLM Use)
Generated: ${new Date().toISOString()}
Project: EShop Backend

=========================================
📂 PROJECT FOLDER STRUCTURE
=========================================

${generateTree(projectRoot)}

=========================================
📦 SOURCE FILES
=========================================

`;

    const files = getAllFiles(projectRoot);
    files.sort((a, b) => a.relative.localeCompare(b.relative));

    console.log(`Found ${files.length} files to export...`);

    for (const file of files) {
        let fileContent;

        try {
            fileContent = fs.readFileSync(file.path, "utf-8");
        } catch {
            continue;
        }

        const sizeKB = (Buffer.byteLength(fileContent) / 1024).toFixed(2);
        const type = detectType(file.relative);

        content += `
============================================================
===== FILE START: ${file.relative}
Type: ${type}
Size: ${sizeKB} KB
============================================================

${fileContent}

===== END FILE =====


`;
    }

    fs.writeFileSync(outputFile, content, "utf-8");
    console.log(`✨ Done! File generated: ${outputFile}`);
    console.log(`📊 Total files exported: ${files.length}`);
}

run();

// Usage: node tools/combine-files.js

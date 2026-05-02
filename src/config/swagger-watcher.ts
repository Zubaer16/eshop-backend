import fs from 'fs';
import path from 'path';
import { reloadSwaggerSpec } from './swagger-generator';
import { Application } from 'express';
import logger from './logger';

let _watcher: fs.FSWatcher | null = null;

export const startSwaggerWatcher = (_app: Application): void => {
  const watchPatterns = [
    'src/modules/**/validators/**/*.ts',
    'docs/**/*.yaml',
    'docs/**/*.yml',
  ];
  
  const watchedPaths = new Set<string>();
  
  const processPath = (pattern: string) => {
    const files = getGlobFiles(pattern);
    files.forEach(file => {
      if (!watchedPaths.has(file)) {
        watchedPaths.add(file);
        watchFile(file);
      }
    });
  };
  
  const watchFile = (filePath: string) => {
    try {
      fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          logger.info(`[Swagger Watcher] File changed: ${filePath}`);
          void reloadSwaggerSpec();
        }
      });
    } catch {
      logger.error(`Error watching ${filePath}: unknown error`);
    }
  };
  
  const getGlobFiles = (pattern: string): string[] => {
    const result: string[] = [];
    const scanDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.yaml') || item.endsWith('.yml'))) {
            result.push(fullPath);
          }
        }
      } catch { /* empty */ }
    };
    
    const base = pattern.startsWith('docs') ? 'docs' : 'src';
    scanDir(base);
    return result;
  };
  
  watchPatterns.forEach(processPath);
};

export const stopSwaggerWatcher = (): void => {
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
};
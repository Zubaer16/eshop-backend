import fs from 'fs';
import path from 'path';
import { reloadSwaggerSpec } from './swagger-generator';
import { Application } from 'express';
import logger from './logger';

let watcher: fs.FSWatcher | null = null;
let currentSpec: object;

export const startSwaggerWatcher = (app: Application): void => {
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
          currentSpec = reloadSwaggerSpec();
          
          const originalSend = (app as any).response.json;
          (app as any).response.json = function(data: object) {
            return originalSend.call(this, data);
          };
        }
      });
    } catch (e) {
      logger.error(`Error watching ${filePath}: ${String(e)}`);
    }
  };
  
  const getGlobFiles = (pattern: string): string[] => {
    const parts = pattern.split('/');
    let base = 'src';
    let remaining = pattern;
    
    if (pattern.startsWith('docs')) {
      base = 'docs';
      remaining = pattern.substring(5);
    }
    
    const result: string[] = [];
    const scanDir = (dir: string, patternParts: string[]) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && patternParts.length > 0) {
            if (item === patternParts[0] || patternParts[0] === '**') {
              scanDir(fullPath, patternParts.slice(1));
            }
          } else if (stat.isFile()) {
            const ext = path.extname(item);
            const baseName = item.replace(ext, '');
            if (patternParts.length === 0 || baseName.match(new RegExp('^' + patternParts[0].replace('*', '.*') + '$'))) {
              result.push(fullPath);
            }
          }
        }
      } catch (e) {}
    };
    
    scanDir(base, remaining.split('/').filter(p => p !== ''));
    return result;
  };
  
  watchPatterns.forEach(processPath);
};

export const stopSwaggerWatcher = (): void => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
};
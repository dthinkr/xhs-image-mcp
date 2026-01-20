/**
 * Test article conversion - batch process all articles with different themes
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { smartPaginateCompat, closeSmartPaginatorBrowser, Theme } from './smart-paginator.js';
import { textToImages, closeBrowser } from './renderer.js';
import { generateCoverImage } from './gemini-image.js';

// Article configurations: filename -> theme
const ARTICLES: { file: string; theme: Theme }[] = [
  { file: '圆周率.md', theme: 'elegant' },
  { file: '蓝藻.md', theme: 'elegant' },
  { file: '地址.md', theme: 'dark' },
  { file: '史高维尔重置.md', theme: 'warm' },
  { file: '白噪音.md', theme: 'minimal' },
];

function cleanMarkdown(content: string): string {
  return content
    .replace(/^#\s+.+$/m, '')  // Remove the title line
    .replace(/^#{2,6}\s+/gm, '')  // Remove other headings
    .replace(/\*\*(.+?)\*\*/g, '$1')  // Bold
    .replace(/\*(.+?)\*/g, '$1')  // Italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links: [text](url) -> text
    .replace(/^[-*_]{3,}$/gm, '---')  // Normalize dividers to ---
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(content: string): string | undefined {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : undefined;
}

async function processArticle(file: string, theme: Theme): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${file} with theme: ${theme}`);
  console.log('='.repeat(60));

  const filePath = join(process.cwd(), 'articles', file);
  const content = readFileSync(filePath, 'utf-8');

  // Extract title and clean content
  const title = extractTitle(content);
  const cleanedContent = cleanMarkdown(content);

  console.log('Title:', title);
  console.log('Content length:', cleanedContent.length, 'characters');

  // Smart paginate
  const hasTitle = !!title;
  const pages = await smartPaginateCompat(cleanedContent, {
    theme,
    fontSize: 'medium',
    ratio: '3:4',
    hasTitle
  });
  console.log('Pages:', pages.length);

  // Generate AI cover image
  let aiCoverImage: string | undefined;
  if (title) {
    console.log('Generating AI cover image...');
    const coverResult = await generateCoverImage(title, cleanedContent, theme, {
      aspectRatio: '3:4'
    });
    if (coverResult) {
      aiCoverImage = coverResult.base64;
      console.log('AI cover generated! Prompt:', coverResult.prompt.slice(0, 80) + '...');
    } else {
      console.log('AI cover generation failed or GEMINI_API_KEY not set');
    }
  }

  // Generate images
  const result = await textToImages(cleanedContent, pages, {
    theme,
    ratio: '3:4',
    fontSize: 'medium',
    title,
    showCover: true,
    aiCoverImage
  });

  console.log('Generated:', result.pageCount, 'images');

  // Save to article-specific folder
  const articleName = basename(file, '.md');
  const outputDir = join(process.cwd(), 'output', `${articleName}-${theme}`);
  mkdirSync(outputDir, { recursive: true });

  result.images.forEach((base64, index) => {
    const filename = `page-${index + 1}.png`;
    writeFileSync(join(outputDir, filename), Buffer.from(base64, 'base64'));
    console.log('Saved:', filename);
  });

  console.log(`Done! Saved to: ${outputDir}`);
}

async function main() {
  console.log('Starting batch article conversion...');
  console.log(`Processing ${ARTICLES.length} articles\n`);

  for (const { file, theme } of ARTICLES) {
    await processArticle(file, theme);
  }

  await closeBrowser();
  await closeSmartPaginatorBrowser();

  console.log('\n' + '='.repeat(60));
  console.log('All articles processed!');
  console.log('='.repeat(60));
}

main().catch(console.error);

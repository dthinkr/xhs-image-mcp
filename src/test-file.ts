/**
 * Test file_to_images functionality
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import { paginateText } from './paginator.js';
import { textToImages, closeBrowser, Theme } from './renderer.js';

function readTextFile(filePath: string): { content: string; title?: string } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');

  // Try to extract title from markdown (first # heading)
  let title: string | undefined;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else {
    // Use filename as title if no heading found
    title = basename(filePath).replace(/\.(md|txt|text)$/i, '');
  }

  // Clean markdown: remove headings for cleaner text display
  let cleanedContent = content
    // Remove markdown headings (keep the text)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove links but keep text
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // Remove images
    .replace(/!\[.*?\]\(.+?\)/g, '')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`(.+?)`/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content: cleanedContent, title };
}

async function testFileToImages() {
  console.log('Testing file_to_images functionality...\n');

  const testFile = join(process.cwd(), 'test-article.md');

  if (!existsSync(testFile)) {
    console.error('Test file not found:', testFile);
    return;
  }

  // Read and parse the file
  const { content, title } = readTextFile(testFile);
  console.log('Extracted title:', title);
  console.log('Content length:', content.length, 'characters');
  console.log('Content preview:', content.slice(0, 100) + '...\n');

  // Create output directory
  const outputDir = join(process.cwd(), 'test-output');
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {}

  // Test with different themes
  const themes: Theme[] = ['minimal', 'elegant', 'warm', 'dark'];

  for (const theme of themes) {
    console.log(`\nGenerating images with theme: ${theme}`);

    const pages = paginateText(content, { fontSize: 'medium', ratio: '3:4' });
    console.log(`  Pages: ${pages.length}`);

    const result = await textToImages(content, pages, {
      theme,
      ratio: '3:4',
      fontSize: 'medium',
      title,
      showCover: true
    });

    console.log(`  Generated: ${result.pageCount} images`);

    // Save images
    result.images.forEach((base64, index) => {
      const filename = `file-${theme}-page-${index + 1}.png`;
      const filepath = join(outputDir, filename);
      writeFileSync(filepath, Buffer.from(base64, 'base64'));
      console.log(`  Saved: ${filename}`);
    });
  }

  await closeBrowser();
  console.log(`\nTest complete! Images saved to: ${outputDir}`);
}

testFileToImages().catch(console.error);

#!/usr/bin/env node

/**
 * Text to Image MCP Server
 * 将文本转换为小红书风格的图片
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { paginateText, estimatePageCount } from './paginator.js';
import { textToImages, closeBrowser, Theme, Ratio, FontSize } from './renderer.js';
import { generateCoverImage, generateImagePrompt, GeneratedImage } from './gemini-image.js';

// Store prompts used for image generation (for logging/debugging)
const generatedPrompts: Map<string, string> = new Map();

/**
 * Read text content from a file path
 * Supports: .md, .txt, .text files
 */
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

// 定义工具
const TEXT_TO_IMAGES_TOOL: Tool = {
  name: 'text_to_images',
  description: `Convert text content to a series of images with Xiaohongshu (小红书) style themes.

Supported themes:
- minimal: Clean white background, good for knowledge/tips content
- elegant: Warm beige with serif font, good for novels/essays
- warm: Warm gradient with card style, good for lifestyle/emotional content
- dark: Dark mode, eye-friendly for night reading

Image ratios:
- 3:4 (1080x1440): Best for Xiaohongshu feed, takes most screen space
- 1:1 (1080x1080): Square format
- 4:3 (1080x810): Landscape format`,
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content to convert to images'
      },
      title: {
        type: 'string',
        description: 'Optional title for cover page'
      },
      theme: {
        type: 'string',
        enum: ['minimal', 'elegant', 'warm', 'dark'],
        default: 'minimal',
        description: 'Visual theme for the images'
      },
      ratio: {
        type: 'string',
        enum: ['3:4', '1:1', '4:3'],
        default: '3:4',
        description: 'Image aspect ratio'
      },
      fontSize: {
        type: 'string',
        enum: ['small', 'medium', 'large'],
        default: 'medium',
        description: 'Font size for content'
      },
      showCover: {
        type: 'boolean',
        default: false,
        description: 'Whether to generate a cover page'
      },
      generateAiCover: {
        type: 'boolean',
        default: false,
        description: 'Generate AI cover image using Gemini. Requires GEMINI_API_KEY environment variable.'
      },
      charsPerPage: {
        type: 'number',
        description: 'Custom characters per page (overrides automatic calculation)'
      },
      outputDir: {
        type: 'string',
        description: 'Directory path to save generated images. If provided, images will be saved as PNG files.'
      }
    },
    required: ['text']
  }
};

const ESTIMATE_PAGES_TOOL: Tool = {
  name: 'estimate_pages',
  description: 'Estimate how many pages the text will be split into without generating images',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content to estimate'
      },
      fontSize: {
        type: 'string',
        enum: ['small', 'medium', 'large'],
        default: 'medium'
      },
      ratio: {
        type: 'string',
        enum: ['3:4', '1:1', '4:3'],
        default: '3:4'
      },
      charsPerPage: {
        type: 'number',
        description: 'Custom characters per page'
      }
    },
    required: ['text']
  }
};

const LIST_THEMES_TOOL: Tool = {
  name: 'list_themes',
  description: 'List all available themes with descriptions',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

const FILE_TO_IMAGES_TOOL: Tool = {
  name: 'file_to_images',
  description: `Convert a local markdown or text file to a series of images.
Supports .md, .txt, .text files.
Automatically extracts title from the first # heading in markdown files.
Cleans up markdown formatting for cleaner text display.`,
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Absolute path to the markdown or text file'
      },
      title: {
        type: 'string',
        description: 'Override the auto-extracted title'
      },
      theme: {
        type: 'string',
        enum: ['minimal', 'elegant', 'warm', 'dark'],
        default: 'minimal',
        description: 'Visual theme for the images'
      },
      ratio: {
        type: 'string',
        enum: ['3:4', '1:1', '4:3'],
        default: '3:4',
        description: 'Image aspect ratio'
      },
      fontSize: {
        type: 'string',
        enum: ['small', 'medium', 'large'],
        default: 'medium',
        description: 'Font size for content'
      },
      showCover: {
        type: 'boolean',
        default: true,
        description: 'Whether to generate a cover page (defaults to true for files)'
      },
      generateAiCover: {
        type: 'boolean',
        default: false,
        description: 'Generate AI cover image using Gemini'
      },
      charsPerPage: {
        type: 'number',
        description: 'Custom characters per page'
      },
      outputDir: {
        type: 'string',
        description: 'Directory path to save generated images. If provided, images will be saved as PNG files.'
      }
    },
    required: ['filePath']
  }
};

// 创建服务器
const server = new Server(
  {
    name: 'xhs-image-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [TEXT_TO_IMAGES_TOOL, FILE_TO_IMAGES_TOOL, ESTIMATE_PAGES_TOOL, LIST_THEMES_TOOL]
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'text_to_images': {
        const {
          text,
          title,
          theme = 'minimal',
          ratio = '3:4',
          fontSize = 'medium',
          showCover = false,
          generateAiCover = false,
          charsPerPage,
          outputDir
        } = args as {
          text: string;
          title?: string;
          theme?: Theme;
          ratio?: Ratio;
          fontSize?: FontSize;
          showCover?: boolean;
          generateAiCover?: boolean;
          charsPerPage?: number;
          outputDir?: string;
        };

        if (!text || typeof text !== 'string') {
          throw new Error('text is required and must be a string');
        }

        // 分页
        const pages = paginateText(text, { fontSize, ratio, charsPerPage });

        // Generate AI cover image if requested
        let aiCoverImage: string | undefined;
        let coverPrompt: string | undefined;

        if (generateAiCover && showCover && title) {
          const coverResult = await generateCoverImage(title, text, theme, {
            aspectRatio: ratio
          });

          if (coverResult) {
            aiCoverImage = coverResult.base64;
            coverPrompt = coverResult.prompt;
            // Store the prompt for reference
            const promptKey = `${Date.now()}-${title.slice(0, 20)}`;
            generatedPrompts.set(promptKey, coverPrompt);
          }
        }

        // 渲染
        const result = await textToImages(text, pages, {
          theme,
          ratio,
          fontSize,
          title,
          showCover,
          aiCoverImage
        });

        // Save to outputDir if provided
        let savedFiles: string[] = [];
        if (outputDir) {
          mkdirSync(outputDir, { recursive: true });
          result.images.forEach((base64, i) => {
            const fileName = `page-${String(i + 1).padStart(2, '0')}.png`;
            const filePath = join(outputDir, fileName);
            writeFileSync(filePath, Buffer.from(base64, 'base64'));
            savedFiles.push(filePath);
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                pageCount: result.pageCount,
                theme,
                ratio,
                dimensions: ratio === '3:4' ? '1080x1440' : ratio === '1:1' ? '1080x1080' : '1080x810',
                aiCoverGenerated: !!aiCoverImage,
                coverPrompt: coverPrompt,
                savedFiles: savedFiles.length > 0 ? savedFiles : undefined,
                images: outputDir ? undefined : result.images.map((img, i) => ({
                  page: i + 1,
                  base64: img,
                  dataUrl: `data:image/png;base64,${img}`
                }))
              }, null, 2)
            }
          ]
        };
      }

      case 'estimate_pages': {
        const {
          text,
          fontSize = 'medium',
          ratio = '3:4',
          charsPerPage
        } = args as {
          text: string;
          fontSize?: FontSize;
          ratio?: Ratio;
          charsPerPage?: number;
        };

        if (!text || typeof text !== 'string') {
          throw new Error('text is required and must be a string');
        }

        const pageCount = estimatePageCount(text, { fontSize, ratio, charsPerPage });
        const charCount = text.length;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                charCount,
                pageCount,
                fontSize,
                ratio
              }, null, 2)
            }
          ]
        };
      }

      case 'list_themes': {
        const themes = {
          minimal: {
            name: 'Minimal',
            description: 'Clean white background with black text. Best for knowledge, tips, and informational content.',
            colors: { background: '#ffffff', text: '#1a1a1a', accent: '#ff2442' }
          },
          elegant: {
            name: 'Elegant',
            description: 'Warm beige background with serif font. Best for novels, essays, and literary content.',
            colors: { background: '#faf8f5', text: '#2c2c2c', accent: '#c9a86c' }
          },
          warm: {
            name: 'Warm',
            description: 'Warm gradient with card style. Best for lifestyle, emotional, and personal content.',
            colors: { background: '#fff9f0', text: '#3d3d3d', accent: '#ff6b6b' }
          },
          dark: {
            name: 'Dark',
            description: 'Dark mode for eye comfort. Best for night reading and tech content.',
            colors: { background: '#1a1a2e', text: '#eaeaea', accent: '#00d4ff' }
          }
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ themes }, null, 2)
            }
          ]
        };
      }

      case 'file_to_images': {
        const {
          filePath,
          title: overrideTitle,
          theme = 'minimal',
          ratio = '3:4',
          fontSize = 'medium',
          showCover = true,  // Default to true for files
          generateAiCover = false,
          charsPerPage,
          outputDir
        } = args as {
          filePath: string;
          title?: string;
          theme?: Theme;
          ratio?: Ratio;
          fontSize?: FontSize;
          showCover?: boolean;
          generateAiCover?: boolean;
          charsPerPage?: number;
          outputDir?: string;
        };

        if (!filePath || typeof filePath !== 'string') {
          throw new Error('filePath is required and must be a string');
        }

        // Read and parse the file
        const { content: text, title: extractedTitle } = readTextFile(filePath);
        const title = overrideTitle || extractedTitle;

        // 分页
        const pages = paginateText(text, { fontSize, ratio, charsPerPage });

        // Generate AI cover image if requested
        let aiCoverImage: string | undefined;
        let coverPrompt: string | undefined;

        if (generateAiCover && showCover && title) {
          const coverResult = await generateCoverImage(title, text, theme, {
            aspectRatio: ratio
          });

          if (coverResult) {
            aiCoverImage = coverResult.base64;
            coverPrompt = coverResult.prompt;
            const promptKey = `${Date.now()}-${title.slice(0, 20)}`;
            generatedPrompts.set(promptKey, coverPrompt);
          }
        }

        // 渲染
        const result = await textToImages(text, pages, {
          theme,
          ratio,
          fontSize,
          title,
          showCover,
          aiCoverImage
        });

        // Save to outputDir if provided
        let savedFiles: string[] = [];
        if (outputDir) {
          mkdirSync(outputDir, { recursive: true });
          result.images.forEach((base64, i) => {
            const fileName = `page-${String(i + 1).padStart(2, '0')}.png`;
            const outputPath = join(outputDir, fileName);
            writeFileSync(outputPath, Buffer.from(base64, 'base64'));
            savedFiles.push(outputPath);
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sourceFile: filePath,
                extractedTitle: extractedTitle,
                usedTitle: title,
                pageCount: result.pageCount,
                theme,
                ratio,
                dimensions: ratio === '3:4' ? '1080x1440' : ratio === '1:1' ? '1080x1080' : '1080x810',
                aiCoverGenerated: !!aiCoverImage,
                coverPrompt: coverPrompt,
                savedFiles: savedFiles.length > 0 ? savedFiles : undefined,
                images: outputDir ? undefined : result.images.map((img, i) => ({
                  page: i + 1,
                  base64: img,
                  dataUrl: `data:image/png;base64,${img}`
                }))
              }, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: message })
        }
      ],
      isError: true
    };
  }
});

// 清理
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Text to Image MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

import PDFDocument from 'pdfkit';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const IMAGE_SIZES = {
  small: { width: 80, height: 80 },
  medium: { width: 120, height: 120 },
  large: { width: 180, height: 180 }
};

export class PDFExporter {
  constructor(storyPath, options = {}) {
    this.storyPath = storyPath;
    this.options = {
      includeCharacters: options.includeCharacters !== false,
      imageSize: options.imageSize || 'medium'
    };
    this.imageDimensions = IMAGE_SIZES[this.options.imageSize] || IMAGE_SIZES.medium;
  }

  async generate() {
    const stateFile = join(this.storyPath, 'state.json');
    if (!existsSync(stateFile)) {
      throw new Error('Story state file not found');
    }

    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    // Title page
    this.addTitlePage(doc, state);

    // Character page (optional)
    if (this.options.includeCharacters && state.worldState?.characters?.length > 0) {
      doc.addPage();
      this.addCharacterPage(doc, state.worldState.characters);
    }

    // Narrative pages
    this.addNarrativePages(doc, state);

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  addTitlePage(doc, state) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Title
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text(state.seed, { align: 'center', width: pageWidth });

    doc.moveDown(2);

    // Subtitle
    doc.fontSize(14)
       .font('Helvetica-Oblique')
       .fillColor('#666666')
       .text('An AI-Generated Story', { align: 'center' });

    doc.moveDown(1);

    // Date
    const createdDate = new Date(state.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#888888')
       .text(`Created: ${createdDate}`, { align: 'center' });

    doc.moveDown(3);

    // Cover image (turn-000.jpg) - larger for title page
    const coverImagePath = join(this.storyPath, 'images', 'turn-000.jpg');
    if (existsSync(coverImagePath)) {
      try {
        const imageWidth = Math.min(300, pageWidth * 0.7);
        const x = doc.page.margins.left + (pageWidth - imageWidth) / 2;
        doc.image(coverImagePath, x, doc.y, {
          fit: [imageWidth, imageWidth],
          align: 'center'
        });
      } catch (err) {
        // Skip image if it can't be loaded
      }
    }

    doc.fillColor('#000000');
  }

  addCharacterPage(doc, characters) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fontSize(18)
       .font('Helvetica-Bold')
       .text('Characters', { align: 'center' });

    doc.moveDown(1);

    for (const char of characters) {
      // Character name
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#c0392b')
         .text(char.name);

      doc.moveDown(0.3);

      // Appearance
      if (char.appearance) {
        const appearance = char.appearance;
        const parts = [];

        // All keys are lowercase after normalizeKeys
        if (appearance.gender) parts.push(appearance.gender);
        if (appearance.age) parts.push(appearance.age);
        if (appearance.height) parts.push(appearance.height);
        if (appearance.build) parts.push(appearance.build);

        const hairParts = [appearance.hairlength, appearance.haircolor, appearance.hairstyle]
          .filter(p => p && p !== 'n/a')
          .join(' ');
        if (hairParts) parts.push(`${hairParts} hair`);

        if (appearance.eyecolor && appearance.eyecolor !== 'n/a') {
          parts.push(`${appearance.eyecolor} eyes`);
        }
        if (appearance.distinguishing) parts.push(appearance.distinguishing);

        if (parts.length > 0) {
          doc.fontSize(10)
             .font('Helvetica')
             .fillColor('#333333')
             .text(`Appearance: ${parts.join(', ')}`, { width: pageWidth });
        }
      }

      // Personality
      if (char.personality) {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Personality: ${char.personality}`, { width: pageWidth });
      }

      // Goals
      if (char.goals) {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#333333')
           .text(`Goals: ${char.goals}`, { width: pageWidth });
      }

      doc.moveDown(1);
    }

    doc.fillColor('#000000');
  }

  addNarrativePages(doc, state) {
    const storyContent = state.storyContent || [];
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // Panel settings
    const panelImageSize = this.imageDimensions.width;
    const panelSpacing = 12;
    const minPanelHeight = panelImageSize + 50; // Minimum height for a panel

    // Start first narrative page
    doc.addPage();

    // Skip the title (index 0), then process pairs of header + narrative
    for (let i = 1; i < storyContent.length; i += 2) {
      const header = storyContent[i] || '';
      const narrative = storyContent[i + 1] || '';

      // Parse turn number from header
      const turnMatch = header.match(/## (Opening|Turn (\d+))(?:\s*-\s*(.+))?/);
      if (!turnMatch) continue;

      const turnLabel = turnMatch[1] === 'Opening' ? 'Opening' : `Turn ${turnMatch[2]}`;
      const timeStr = turnMatch[3] || '';
      const turn = turnMatch[1] === 'Opening' ? 0 : parseInt(turnMatch[2]);

      // Check if we need a new page (not enough space for minimum panel)
      const remainingHeight = doc.page.height - doc.page.margins.bottom - doc.y;
      if (remainingHeight < minPanelHeight) {
        doc.addPage();
      }

      // Panel start Y position
      const panelStartY = doc.y;

      // Turn header (smaller, inline)
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(turnLabel + (timeStr ? ` - ${timeStr}` : ''), doc.page.margins.left, doc.y);

      doc.moveDown(0.3);

      // Image for this turn
      const turnStr = turn.toString().padStart(3, '0');
      const imagePath = join(this.storyPath, 'images', `turn-${turnStr}.jpg`);

      const textStartY = doc.y;
      let panelEndY = doc.y;

      if (existsSync(imagePath)) {
        try {
          // Float image to left
          const imgX = doc.page.margins.left;
          const imgY = textStartY;

          doc.image(imagePath, imgX, imgY, {
            fit: [panelImageSize, panelImageSize]
          });

          // Text wraps to the right of image
          const textX = doc.page.margins.left + panelImageSize + 10;
          const textWidth = pageWidth - panelImageSize - 10;

          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#000000')
             .text(narrative, textX, textStartY, {
               width: textWidth,
               align: 'justify'
             });

          // Panel ends at the greater of image bottom or text bottom
          const imageBottom = imgY + panelImageSize;
          panelEndY = Math.max(doc.y, imageBottom);

        } catch (err) {
          // If image fails, just add text at full width
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor('#000000')
             .text(narrative, { width: pageWidth, align: 'justify' });
          panelEndY = doc.y;
        }
      } else {
        // No image, just add text at full width
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#000000')
           .text(narrative, { width: pageWidth, align: 'justify' });
        panelEndY = doc.y;
      }

      // Draw subtle separator line
      doc.y = panelEndY + 5;
      doc.strokeColor('#e0e0e0')
         .lineWidth(0.5)
         .moveTo(doc.page.margins.left, doc.y)
         .lineTo(doc.page.width - doc.page.margins.right, doc.y)
         .stroke();

      doc.y += panelSpacing;
    }
  }
}

export async function exportStoryToPDF(storyPath, options = {}) {
  const exporter = new PDFExporter(storyPath, options);
  return exporter.generate();
}

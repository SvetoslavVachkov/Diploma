const fs = require('fs');
const pdfParse = require('pdf-parse');

const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer, { max: 0 });

    let text = data.text || '';
    if (!text || text.length === 0) {
      throw new Error('No text extracted from PDF');
    }

    text = text
      .replace(/\u0000/g, '')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\u200B/g, '');

    const lines = text.split(/\r?\n/);
    const cleanedLines = lines
      .map((line) =>
        line
          .replace(/[\x7F-\x9F]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((line) => line.length > 0);

    const result = cleanedLines.join('\n');
    if (!result || result.length < 10) {
      throw new Error('Insufficient text extracted from PDF');
    }

    return result;
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
};

module.exports = {
  extractTextFromPDF
};



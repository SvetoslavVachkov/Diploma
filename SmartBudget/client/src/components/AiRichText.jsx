import React from 'react';

const renderInline = (text) => {
  const parts = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`strong-${match.index}`}>{match[1]}</strong>);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

const normalizeLines = (content) =>
  String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());

const AiRichText = ({ content, className = '' }) => {
  const lines = normalizeLines(content).filter((line, index, arr) => {
    if (line.trim().length > 0) return true;
    return arr[index - 1]?.trim().length > 0 && arr[index + 1]?.trim().length > 0;
  });

  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${i}`} className="ai-rich-text-heading ai-rich-text-heading-sm">
          {renderInline(line.slice(4))}
        </h4>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="ai-rich-text-heading">
          {renderInline(line.slice(3))}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="ai-rich-text-title">
          {renderInline(line.slice(2))}
        </h2>
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="ai-rich-text-list ai-rich-text-list-ordered">
          {items.map((item, idx) => (
            <li key={`oli-${idx}`}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="ai-rich-text-list">
          {items.map((item, idx) => (
            <li key={`uli-${idx}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }

    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p-${i}`} className="ai-rich-text-paragraph">
          {renderInline(paragraph.join(' '))}
        </p>
      );
    }
  }

  return <div className={`ai-rich-text ${className}`.trim()}>{blocks}</div>;
};

export default AiRichText;

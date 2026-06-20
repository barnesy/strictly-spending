import {
  Box,
  Typography,
  Divider,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
} from '@mui/material';

type MarkdownBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'divider' }
  | { type: 'table'; headers: string[]; rows: string[][]; alignments?: ('left' | 'center' | 'right')[] }
  | { type: 'text'; text: string }
  | { type: 'empty' };

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if it's a table (contains at least one pipe, and the next line is a separator containing pipes/dashes/colons/spaces)
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    if (
      trimmed.includes('|') &&
      nextLine.includes('|') &&
      /^[|:\-\s]+$/.test(nextLine)
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 1) {
        const parsedRows = tableLines.map((row) => {
          const cells = row.split('|').map((c) => c.trim());
          if (cells[0] === '') cells.shift();
          if (cells[cells.length - 1] === '') cells.pop();
          return cells;
        });

        const headerRow = parsedRows[0];
        
        // Find separator row (contains only dashes, colons, spaces)
        const separatorRow = parsedRows.slice(1).find((row) =>
          row.every((cell) => /^[:\-\s]+$/.test(cell))
        );

        const alignments: ('left' | 'center' | 'right')[] = [];
        if (separatorRow) {
          separatorRow.forEach((cell) => {
            const trimmed = cell.trim();
            const startsWithColon = trimmed.startsWith(':');
            const endsWithColon = trimmed.endsWith(':');
            if (startsWithColon && endsWithColon) {
              alignments.push('center');
            } else if (endsWithColon) {
              alignments.push('right');
            } else {
              alignments.push('left');
            }
          });
        }

        const dataRows = parsedRows.slice(1).filter((row) => {
          const isSeparator = row.every((cell) => /^[:\-\s]+$/.test(cell));
          return !isSeparator;
        }).map((row) => {
          // Pad or truncate row to have the same number of columns as headers
          const padded = [...row];
          while (padded.length < headerRow.length) {
            padded.push('');
          }
          if (padded.length > headerRow.length) {
            return padded.slice(0, headerRow.length);
          }
          return padded;
        });

        blocks.push({
          type: 'table',
          headers: headerRow,
          rows: dataRows,
          alignments: alignments,
        });
        continue;
      }
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.substring(2) });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.substring(3) });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.substring(4) });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', text: trimmed.substring(2) });
    } else if (trimmed === '---') {
      blocks.push({ type: 'divider' });
    } else if (!trimmed) {
      blocks.push({ type: 'empty' });
    } else {
      blocks.push({ type: 'text', text: trimmed });
    }
    i++;
  }

  return blocks;
}

function renderInlineMarkdown(text: string, onLinkClick?: (url: string) => void): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);
  
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          style={{
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0,0,0,0.06)',
            padding: '1.5px 3px',
            borderRadius: '3px',
            fontSize: '90%',
            color: '#d32f2f',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const closingBracket = part.indexOf(']');
      const label = part.slice(1, closingBracket);
      const url = part.slice(closingBracket + 2, -1);
      const isDocLink = url.startsWith('doc://');

      return (
        <a
          key={idx}
          href={url}
          target={isDocLink ? undefined : "_blank"}
          rel={isDocLink ? undefined : "noopener noreferrer"}
          onClick={isDocLink && onLinkClick ? (e) => {
            e.preventDefault();
            onLinkClick(url);
          } : undefined}
          style={{ color: '#1976d2', textDecoration: 'underline', fontWeight: 500, cursor: 'pointer' }}
        >
          {label}
        </a>
      );
    }
    return part;
  });
}

export default function SimpleMarkdown({ content, onLinkClick }: { content: string; onLinkClick?: (url: string) => void }) {
  const blocks = parseMarkdown(content);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <Typography
                id={block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}
                key={idx}
                variant="h6"
                sx={{
                  fontWeight: 700,
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  pb: 0.5,
                  mt: 1.5,
                  color: 'text.primary',
                }}
              >
                {renderInlineMarkdown(block.text, onLinkClick)}
              </Typography>
            );
          case 'h2':
            return (
              <Typography
                id={block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}
                key={idx}
                variant="subtitle1"
                sx={{ fontWeight: 700, mt: 1, color: 'text.primary' }}
              >
                {renderInlineMarkdown(block.text, onLinkClick)}
              </Typography>
            );
          case 'h3':
            return (
              <Typography
                id={block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}
                key={idx}
                variant="subtitle2"
                sx={{ fontWeight: 700, color: 'text.secondary', mt: 0.5 }}
              >
                {renderInlineMarkdown(block.text, onLinkClick)}
              </Typography>
            );
          case 'bullet':
            return (
              <Box
                key={idx}
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 1 }}
              >
                <Box
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    mt: 0.85,
                    flexShrink: 0,
                  }}
                />
                <Typography
                  variant="body2"
                  color="text.primary"
                  sx={{ fontSize: 13, lineHeight: 1.5 }}
                >
                  {renderInlineMarkdown(block.text, onLinkClick)}
                </Typography>
              </Box>
            );
          case 'divider':
            return <Divider key={idx} sx={{ my: 1 }} />;
          case 'empty':
            return <Box key={idx} sx={{ height: 4 }} />;
          case 'table':
            return (
              <TableContainer
                key={idx}
                component={Paper}
                variant="outlined"
                sx={{
                  my: 2,
                  overflowX: 'auto',
                  borderRadius: 2.5,
                  borderColor: 'divider',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <Table size="small" sx={{ minWidth: 320 }}>
                  <TableHead sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50' }}>
                    <TableRow>
                      {block.headers.map((h, i) => {
                        const align = block.alignments && block.alignments[i] ? block.alignments[i] : 'left';
                        return (
                          <TableCell
                            key={i}
                            align={align}
                            sx={{
                              fontWeight: 700,
                              fontSize: '12px',
                              py: 1.25,
                              px: 2,
                              color: 'text.secondary',
                              borderBottom: '2px solid',
                              borderColor: 'divider',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {renderInlineMarkdown(h, onLinkClick)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {block.rows.map((row, rIdx) => (
                      <TableRow key={rIdx} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        {row.map((cell, cIdx) => {
                          let align: 'left' | 'center' | 'right' = 'left';
                          if (block.alignments && block.alignments[cIdx]) {
                            align = block.alignments[cIdx];
                          } else {
                            // Robust fallback check for numbers
                            const cleanVal = cell.replace(/\*\*|\*|_/g, '').trim();
                            const withoutParentheses = cleanVal.replace(/^\((.*)\)$/, '$1').trim();
                            const finalVal = withoutParentheses.replace(/^\$/, '').replace(/,/g, '').replace(/%$/, '').trim();
                            const isNum = finalVal !== '' && !isNaN(Number(finalVal));
                            if (isNum) align = 'right';
                          }

                          const isBold = cell.trim().startsWith('**') && cell.trim().endsWith('**');

                          return (
                            <TableCell
                              key={cIdx}
                              align={align}
                              sx={{
                                fontSize: '13px',
                                py: 1.25,
                                px: 2,
                                color: 'text.primary',
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                fontVariantNumeric: 'tabular-nums', // line up math digits!
                                fontWeight: isBold ? 700 : 400,
                              }}
                            >
                              {renderInlineMarkdown(cell, onLinkClick)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          case 'text':
          default:
            return (
              <Typography
                key={idx}
                variant="body2"
                color="text.primary"
                sx={{ fontSize: 13, lineHeight: 1.5 }}
              >
                {renderInlineMarkdown(block.text, onLinkClick)}
              </Typography>
            );
        }
      })}
    </Box>
  );
}

import { useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  useTheme
} from '@mui/material';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle
} from 'react-resizable-panels';
import SimpleMarkdown from '../../components/SimpleMarkdown';

interface DocumentMarkdownViewProps {
  loadedContent: string;
  setSearchParams: (params: Record<string, string>) => void;
}

export function DocumentMarkdownView({ loadedContent, setSearchParams }: DocumentMarkdownViewProps) {
  const theme = useTheme();
  
  const handleLinkClick = useCallback((url: string) => {
    const match = url.match(/^doc:\/\/([^#]+)(?:#tab=(.+))?$/);
    if (match) {
      setSearchParams({ previewId: match[1], tab: match[2] || 'All' });
    }
  }, [setSearchParams]);

  // Extract Table of Contents headings from Markdown
  const tocItems = useMemo(() => {
    if (!loadedContent) return [];
    const lines = loadedContent.split('\n');
    const items: Array<{ text: string; id: string; level: number }> = [];
    const seen: Record<string, number> = {};
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim().replace(/[*_`]/g, '');
        let slug = text.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        if (seen[slug] !== undefined) {
          seen[slug]++;
          slug = `${slug}-${seen[slug]}`;
        } else {
          seen[slug] = 0;
        }
        items.push({ text, id: slug, level });
      }
    }
    return items;
  }, [loadedContent]);

  const handleScrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <PanelGroup
      orientation="horizontal"
      style={{
        flex: 1,
        minHeight: 0,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: `${theme.shape.borderRadius}px`,
        overflow: 'hidden'
      }}
    >
      {/* Table of Contents Column */}
      <Panel id="pnl-toc-v2" defaultSize="35%" minSize="20%" maxSize="50%">
        <Box sx={{ height: '100%', overflowY: 'scroll', p: 2 }}>
          <Typography variant="subtitle2" fontWeight="700" color="text.secondary" sx={{ mb: 1.5 }}>
            Table of Contents
          </Typography>
          {tocItems.length > 0 ? (
            <List dense disablePadding>
              {tocItems.map((item, idx) => (
                <ListItemButton
                  key={idx}
                  onClick={() => handleScrollToHeading(item.id)}
                  sx={{
                    pl: (item.level - 1) * 2,
                    py: 0.5,
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    mb: 0.5
                  }}
                >
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontSize: '13px',
                      fontWeight: item.level === 1 ? 600 : 400,
                      color: item.level === 1 ? 'text.primary' : 'text.secondary',
                      noWrap: true
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
              No headings found
            </Typography>
          )}
        </Box>
      </Panel>

      {/* Resizable Divider Handle */}
      <PanelResizeHandle aria-label="Resize panels" style={{ width: 16, position: 'relative' }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            margin: '0 auto',
            width: 2,
            bgcolor: 'divider',
            borderRadius: 1,
            transition: 'background-color 120ms ease',
            '[data-resize-handle-active] &, &:hover': {
              bgcolor: 'primary.main',
              width: 3,
            },
          }}
        />
      </PanelResizeHandle>

      {/* Right Column: Content */}
      <Panel id="pnl-markdown-content-v2" defaultSize="65%" minSize="50%">
        <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', p: 3 }}>
          <SimpleMarkdown
            content={loadedContent}
            onLinkClick={handleLinkClick}
          />
        </Box>
      </Panel>
    </PanelGroup>
  );
}

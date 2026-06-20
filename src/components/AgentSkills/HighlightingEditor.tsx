import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { AVAILABLE_TOOLS } from '../../aiTools';

export const highlightKeywords = (text: string) => {
  if (!text) return '\n';
  
  // HTML escape
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Dynamically build keywords from available tools plus schema keywords
  const tools = AVAILABLE_TOOLS.flatMap(t => t.name.split(' / '));
  const keywords = [
    ...tools,
    'agent_action',
    'gen_ux',
    'choices',
    'confirmation',
    'form'
  ];

  // Build regex to match keywords as whole words
  const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');

  escaped = escaped.replace(regex, (match) => {
    let colorVar = 'var(--highlight-blue)'; // blue for tools
    if (['agent_action', 'gen_ux'].includes(match)) {
      colorVar = 'var(--highlight-purple)'; // purple for schema structures
    } else if (['choices', 'confirmation', 'form'].includes(match)) {
      colorVar = 'var(--highlight-green)'; // green for UX states
    } else if (match === 'none') {
      colorVar = 'var(--highlight-orange)'; // orange for none
    }
    return `<span style="color: ${colorVar}; font-weight: 700;">${match}</span>`;
  });

  // Make sure trailing newlines render nicely in pre/code
  if (escaped.endsWith('\n')) {
    escaped += ' ';
  }

  return escaped;
};

export interface HighlightingEditorProps {
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
}

export const HighlightingEditor = forwardRef<HTMLTextAreaElement, HighlightingEditorProps>(
  ({ placeholder, value, onChange, onKeyDown, disabled }, ref) => {
    const theme = useTheme();
    const backdropRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Synchronize ref if parent passed one
    useImperativeHandle(ref, () => textareaRef.current!);

    const syncScroll = () => {
      if (textareaRef.current && backdropRef.current) {
        backdropRef.current.scrollTop = textareaRef.current.scrollTop;
        backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    };

    useEffect(() => {
      syncScroll();
    }, [value]);

    return (
      <Box
        sx={{
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.default',
          boxSizing: 'border-box',
          '--highlight-blue': theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.main,
          '--highlight-purple': theme.palette.mode === 'dark' ? theme.palette.secondary.light : theme.palette.secondary.main,
          '--highlight-green': theme.palette.mode === 'dark' ? '#81c784' : '#2e7d32',
          '--highlight-orange': theme.palette.mode === 'dark' ? '#ffb74d' : '#ed6c02',
        }}
      >
        {/* Backdrop (rendered under textarea) */}
        <Box
          ref={backdropRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: '24px max(24px, calc((100% - 900px) / 2))',
            margin: 0,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.65,
            color: 'text.primary',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden', // matched scroll via ref
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
          dangerouslySetInnerHTML={{ __html: highlightKeywords(value) }}
        />

        {/* Textarea overlay */}
        <textarea
          ref={(el) => {
            textareaRef.current = el;
            syncScroll();
          }}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          disabled={disabled}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.65,
            color: 'transparent',
            caretColor: theme.palette.text.primary,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '24px max(24px, calc((100% - 900px) / 2))',
            margin: 0,
            overflowY: 'scroll',
            boxSizing: 'border-box',
            WebkitTextFillColor: 'transparent',
            wordBreak: 'break-word',
          }}
        />
      </Box>
    );
  }
);

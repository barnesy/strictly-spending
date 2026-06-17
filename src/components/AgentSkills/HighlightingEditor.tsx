import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

export const highlightKeywords = (text: string) => {
  if (!text) return '\n';
  
  // HTML escape
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Keywords to highlight
  const keywords = [
    'query_data',
    'subscription_alerts',
    'spending_anomalies',
    'audit_accessibility',
    'create_artifact',
    'update_artifact',
    'dom_update',
    'navigate',
    'filter',
    'none',
    'agent_action',
    'gen_ux',
    'choices',
    'confirmation',
    'form'
  ];

  // Build regex to match keywords as whole words
  const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');

  escaped = escaped.replace(regex, (match) => {
    let color = '#1976d2'; // blue for tools
    if (['agent_action', 'gen_ux'].includes(match)) {
      color = '#9c27b0'; // purple for schema structures
    } else if (['choices', 'confirmation', 'form'].includes(match)) {
      color = '#2e7d32'; // green for UX states
    } else if (match === 'none') {
      color = '#ed6c02'; // orange for none
    }
    return `<span style="color: ${color}; font-weight: 700;">${match}</span>`;
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
          backgroundColor: theme.palette.grey[50],
          boxSizing: 'border-box',
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
            padding: '24px',
            margin: 0,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.65,
            color: theme.palette.text.primary,
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
            padding: '24px',
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

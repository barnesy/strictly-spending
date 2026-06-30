import { useState } from 'react';
import { Box, Stack, TextField, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  onStop?: () => void;
  loading?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, loading }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <Box
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        flexShrink: 0,
      }}
    >
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          placeholder={loading ? "Thinking..." : "E.g. Show me food spending..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSend();
            }
          }}
          disabled={disabled}
        />
        {loading && onStop ? (
          <IconButton
            color="error"
            onClick={onStop}
            aria-label="Stop execution"
          >
            <StopIcon />
          </IconButton>
        ) : (
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            aria-label="Send message"
          >
            <SendIcon />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

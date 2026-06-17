import { useState } from 'react';
import { Box, Stack, TextField, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
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
          placeholder="E.g. Show me food spending..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSend();
            }
          }}
          disabled={disabled}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          aria-label="Send message"
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}

import { useState, useRef } from 'react';
import { Box, Stack, TextField, IconButton, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import AttachFileIcon from '@mui/icons-material/AttachFile';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  onStop?: () => void;
  loading?: boolean;
  onUpload?: (file: File) => void;
  isUploading?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, loading, onUpload, isUploading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        {onUpload && (
          <>
            <input
              type="file"
              hidden
              ref={fileInputRef}
              accept="image/*,application/pdf"
              onChange={handleFileChange}
            />
            <IconButton
              color="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              aria-label="Upload document"
            >
              {isUploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
            </IconButton>
          </>
        )}
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

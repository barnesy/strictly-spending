import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import type { ChatMessage } from '../../ai';
import { formatModelName } from '../../chatStore';

export interface RecentLLMOutputProps {
  chatMessages: ChatMessage[];
  modelName: string;
}

export const RecentLLMOutput: React.FC<RecentLLMOutputProps> = ({ chatMessages, modelName }) => {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Raw JSON output from the last {formatModelName(modelName)} completion (Developer Console).
      </Typography>
      <Paper
        variant="outlined"
        component="pre"
        sx={{
          p: 2.5,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : 'grey.950',
          color: 'success.main',
          fontFamily: 'monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          maxHeight: '500px',
          overflowY: 'auto'
        }}
      >
        {(() => {
          const lastMsg = chatMessages.slice().reverse().find(m => m.role === 'assistant');
          if (!lastMsg) return 'No assistant messages yet.';
          try {
            // Prettify if it's JSON
            return JSON.stringify(JSON.parse(lastMsg.content), null, 2);
          } catch (e) {
            return lastMsg.content;
          }
        })()}
      </Paper>
    </Box>
  );
};

import { Drawer } from '@mui/material';
import CopilotChat from './CopilotChat';

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <CopilotChat onClose={onClose} showCloseButton={true} isEmbedded={false} />
    </Drawer>
  );
}

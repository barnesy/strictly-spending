import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotOrchestrator } from '../CopilotOrchestrator';
import { localAI } from '../index';

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    localAI: {
      chatCopilot: vi.fn()
    }
  };
});

describe('CopilotOrchestrator', () => {
  const mockSkills = [
    { id: 'builtin:pnl', name: 'Profit and Loss', description: 'P&L Statement' },
    { id: 'builtin:runway', name: 'Runway', description: 'Cash Runway' },
    { id: 'custom:budget', name: 'Budget Planner', description: 'Plan budget' }
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('classifyIntent', () => {
    it('uses fast heuristic for P&L', async () => {
      const match = await CopilotOrchestrator.classifyIntent('show me profit and loss', mockSkills);
      expect(match?.id).toBe('builtin:pnl');
      // Should not call LLM
      expect(localAI.chatCopilot).not.toHaveBeenCalled();
    });

    it('uses fast heuristic for Runway', async () => {
      const match = await CopilotOrchestrator.classifyIntent('what is my runway', mockSkills);
      expect(match?.id).toBe('builtin:runway');
      expect(localAI.chatCopilot).not.toHaveBeenCalled();
    });

    it('falls back to LLM for non-heuristic matches', async () => {
      vi.mocked(localAI.chatCopilot).mockResolvedValueOnce(JSON.stringify({ skillId: 'custom:budget' }));
      
      const match = await CopilotOrchestrator.classifyIntent('help me plan my money', mockSkills);
      
      expect(localAI.chatCopilot).toHaveBeenCalledOnce();
      expect(match?.id).toBe('custom:budget');
    });

    it('returns null if LLM outputs none', async () => {
      vi.mocked(localAI.chatCopilot).mockResolvedValueOnce(JSON.stringify({ skillId: 'none' }));
      
      const match = await CopilotOrchestrator.classifyIntent('hello there', mockSkills);
      
      expect(localAI.chatCopilot).toHaveBeenCalledOnce();
      expect(match).toBeNull();
    });
  });
});

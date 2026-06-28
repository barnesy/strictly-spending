import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotOrchestrator } from '../CopilotOrchestrator';
import { useChatStore } from '../../chatStore';
import { localAI } from '../index';
import { queryClient } from '../../queryClient';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getArtifacts: vi.fn(),
  }
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd) => {
    if (cmd === 'build_forecast') return [];
    return { 
      totalSpend: 100, spendCount: 1, spendAverage: 100, totalBudget: 0, 
      resolvedCategoryNames: ['Food'], isAll: false, budgetBreakdowns: null,
      monthly_breakdown: [], yearly_breakdown: [], category_breakdown: [], recent_transactions: []
    };
  })
}));

vi.mock('../../chatStore', () => {
  const mockChatStore = {
    startStreamingMessage: vi.fn(),
    appendStreamingToken: vi.fn(),
    finalizeStreamingMessage: vi.fn(),
    addMessage: vi.fn(),
    messages: [],
  };
  return {
    useChatStore: {
      getState: vi.fn(() => mockChatStore)
    },
    formatModelName: () => 'MockModel'
  };
});

vi.mock('../index', () => ({
  localAI: {
    modelName: 'mock',
    chatCopilot: vi.fn()
  },
  calculateGlobalRunwayData: vi.fn().mockResolvedValue({})
}));

vi.mock('../../queryClient', () => ({
  queryClient: {
    fetchQuery: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../api', () => ({
  api: {
    getCategories: vi.fn().mockResolvedValue([]),
    getAccounts: vi.fn().mockResolvedValue([]),
    getTransactions: vi.fn().mockResolvedValue([]),
    getBudgets: vi.fn().mockResolvedValue([]),
    getArtifacts: vi.fn().mockResolvedValue([ { id: 'art-123', title: 'Test', content: 'Old' } ]),
    putArtifact: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('../../store', () => ({
  useFilters: {
    getState: vi.fn(() => ({
      demoMode: false,
      earliestTransactionDate: '2023-01-01',
      latestTransactionDate: '2023-12-31',
      preset: 'allTime',
      searchQuery: ''
    }))
  },
  resolveDateRange: vi.fn(() => ({ start: new Date('2023-01-01'), end: new Date('2023-12-31') }))
}));

import { UpdateArtifactTool } from '../tools/UpdateArtifactTool';

describe('CopilotOrchestrator', () => {
  const mockContext = {
    navigate: vi.fn(),
    location: { pathname: '/' },
    signal: new AbortController().signal
  };

  const mockUserMsg = { role: 'user' as const, content: 'Hello' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(UpdateArtifactTool.prototype, 'execute').mockResolvedValue({ feedbackError: 'SECURITY EXCEPTION: without user confirmation' });
  });

  it('should stop looping when LLM returns a plain text response without tool calls', async () => {
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'Here is your plain text response.',
      tool_calls: undefined
    });

    const storeState = useChatStore.getState();
    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    expect(localAI.chatCopilot).toHaveBeenCalledTimes(1);
    expect(storeState.finalizeStreamingMessage).toHaveBeenCalled();
    const finalCallArgs = (storeState.finalizeStreamingMessage as any).mock.calls[0];
    expect(finalCallArgs[0]).toBe('Here is your plain text response.');
    // Action result should be null when no tool is called natively (or handled gracefully)
    expect(finalCallArgs[1]).toBeNull();
  });

  it('should execute tool call (e.g. query_data) and append system result to history, then loop', async () => {
    // First turn: LLM calls query_data
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: '',
      tool_calls: [{
        function: {
          name: 'query_data',
          arguments: JSON.stringify({ categories: ['food'], preset: 'lastMonth' })
        }
      }]
    });

    // Second turn: LLM provides final response
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'You spent $100 on food.',
      tool_calls: undefined
    });

    const storeState = useChatStore.getState();
    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    expect(localAI.chatCopilot).toHaveBeenCalledTimes(2);

    const firstCallArgs = (localAI.chatCopilot as any).mock.calls[0];
    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    
    // Check that the system injected the tool result into the history for the second call
    const activeHistoryForSecondCall = secondCallArgs[0];
    const systemMessage = activeHistoryForSecondCall.find((msg: any) => msg.role === 'tool');
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('Database Query Results');
    expect(systemMessage.content).toContain('rendered as interactive charts');

    const finalizeCalls = (storeState.finalizeStreamingMessage as any).mock.calls;
    const finalCallArgs = finalizeCalls[finalizeCalls.length - 1];
    expect(finalCallArgs[0]).toBe('You spent $100 on food.');
    expect(finalCallArgs[1]).toBeNull();
  });

  it('should reject update_artifact without confirmed: true due to HITL enforcement', async () => {
    // LLM maliciously attempts to bypass confirmation
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: '',
      tool_calls: [{
        function: {
          name: 'update_artifact',
          arguments: JSON.stringify({ id: 'art-123', content: 'Hacked content' }) // No confirmed parameter
        }
      }]
    });

    // LLM gives up
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'I need you to confirm first.',
      tool_calls: undefined
    });

    try {
      await CopilotOrchestrator.run(mockUserMsg, mockContext);
    } catch (e) {
      console.error("Test Error caught:", e);
    }

    console.log("Mock calls:", (localAI.chatCopilot as any).mock.calls.length);
    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    if (secondCallArgs) {
      const activeHistoryForSecondCall = secondCallArgs[0];
      const systemMessage = activeHistoryForSecondCall.find((msg: any) => msg.role === 'tool');
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('SECURITY EXCEPTION');
      expect(systemMessage.content).toContain('without user confirmation');
    } else {
      throw new Error('chatCopilot was not called a second time');
    }
  });

  it('should reject create_artifact if identifier already exists to prevent HITL bypass', async () => {
    // First we need to mock api.getArtifacts to return an existing artifact
    vi.mocked(api.getArtifacts).mockResolvedValueOnce([{
      id: 'existing-art-123',
      title: 'Existing',
      content: 'Old',
      type: 'markdown',
      createdAt: '2023',
      updatedAt: '2023'
    }]);

    // LLM maliciously attempts to bypass confirmation by calling create_artifact with an existing identifier
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: '',
      tool_calls: [{
        function: {
          name: 'create_artifact',
          arguments: JSON.stringify({ identifier: 'existing-art-123', content: 'Hacked content' })
        }
      }]
    });

    // LLM receives the security exception and gives up
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'I must use update_artifact instead.',
      tool_calls: undefined
    });

    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    const activeHistoryForSecondCall = secondCallArgs[0];
    const systemMessage = activeHistoryForSecondCall.find((msg: any) => msg.role === 'tool');
    
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('SECURITY EXCEPTION');
    expect(systemMessage.content).toContain('Artifact already exists. You must use the `update_artifact` tool');
  });

  it('should reject update_tax_settings without confirmed: true due to HITL enforcement', async () => {
    // LLM maliciously attempts to bypass confirmation by calling update_tax_settings without confirmed: true
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: '',
      tool_calls: [{
        function: {
          name: 'update_tax_settings',
          arguments: JSON.stringify({ taxData: { hasBusiness: true } }) // No confirmed parameter
        }
      }]
    });

    // LLM receives the security exception and gives up
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'I must ask for confirmation first.',
      tool_calls: undefined
    });

    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    const activeHistoryForSecondCall = secondCallArgs[0];
    const systemMessage = activeHistoryForSecondCall.find((msg: any) => msg.role === 'tool');
    
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('SECURITY EXCEPTION');
    expect(systemMessage.content).toContain('You attempted to modify tax settings without user confirmation');
  });

  it('should support long agentic workflows up to 15 loops', async () => {
    // We will simulate 14 tool calls, and on the 15th it should force exit.
    for (let i = 0; i < 14; i++) {
      (localAI.chatCopilot as any).mockResolvedValueOnce({
        content: '',
        tool_calls: [{
          function: {
            name: 'query_data',
            arguments: JSON.stringify({ categories: ['food'], preset: 'lastMonth' })
          }
        }]
      });
    }

    // On the 15th iteration (loop === maxLoops), it should receive the "This is the final turn" system prompt.
    // We will return plain text to cleanly exit.
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'I have finished all 15 loops.',
      tool_calls: undefined
    });

    const storeState = useChatStore.getState();
    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    // It should have executed exactly 15 times
    expect(localAI.chatCopilot).toHaveBeenCalledTimes(15);

    // The 15th call should have the forceful exit prompt at the end of its history array
    const fifteenthCallArgs = (localAI.chatCopilot as any).mock.calls[14];
    const activeHistoryForFifteenthCall = fifteenthCallArgs[0];
    const finalSystemPrompt = activeHistoryForFifteenthCall[activeHistoryForFifteenthCall.length - 1];
    
    expect(finalSystemPrompt.role).toBe('system');
    expect(finalSystemPrompt.content).toContain('This is the final turn. Summarize the results');

    // Make sure it finalized properly
    const finalizeCalls = (storeState.finalizeStreamingMessage as any).mock.calls;
    const finalCallArgs = finalizeCalls[finalizeCalls.length - 1];
    expect(finalCallArgs[0]).toBe('I have finished all 15 loops.');
  });
});

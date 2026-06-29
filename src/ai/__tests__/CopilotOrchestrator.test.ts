import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotOrchestrator } from '../CopilotOrchestrator';
import { useChatStore } from '../../chatStore';
import { localAI } from '../index';

// We mock localAI to control the "LLM" responses for orchestrator testing.
vi.mock('../index', () => ({
  localAI: {
    modelName: 'mock',
    chatCopilot: vi.fn()
  },
  calculateGlobalRunwayData: vi.fn().mockResolvedValue({})
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

// Mock the tools we expect the LLM to call so we don't actually hit their complex inner logic
import { QueryDataTool } from '../tools/QueryDataTool';
vi.mock('../tools/QueryDataTool', () => ({
  QueryDataTool: class {
    name = 'query_data';
    execute = vi.fn().mockResolvedValue({
      actionResult: { action: 'query_data' },
      systemResultsMsg: 'Database Query Results rendered as interactive charts'
    });
  }
}));

import { UpdateArtifactTool } from '../tools/UpdateArtifactTool';
vi.mock('../tools/UpdateArtifactTool', () => ({
  UpdateArtifactTool: class {
    name = 'update_artifact';
    execute = vi.fn().mockResolvedValue({
      feedbackError: 'SECURITY EXCEPTION: You attempted to modify an artifact without user confirmation.'
    });
  }
}));

describe('CopilotOrchestrator', () => {
  const mockContext = {
    navigate: vi.fn(),
    location: { pathname: '/' },
    signal: new AbortController().signal
  };

  const mockUserMsg = { role: 'user' as const, content: 'Hello' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stop looping when LLM returns a plain text response without tool calls', async () => {
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'Here is your plain text response.',
      tool_calls: undefined
    });

    const storeState = useChatStore.getState();
    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    expect(localAI.chatCopilot).toHaveBeenCalledTimes(1);
    expect((storeState.finalizeStreamingMessage as any).mock.calls[0][0]).toBe('Here is your plain text response.');
  });

  it('should execute a standard tool call and append system result to history, then loop to generate a final response', async () => {
    // First turn: LLM calls a tool (e.g., query_data)
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

    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    const activeHistoryForSecondCall = secondCallArgs[0];
    
    // Check that the system injected the tool result into the history for the second call
    const systemMessage = activeHistoryForSecondCall.find((msg: any) => msg.role === 'tool');
    expect(systemMessage).toBeDefined();
    
    // Ensure final response is passed through
    const finalizeCalls = (storeState.finalizeStreamingMessage as any).mock.calls;
    const finalCallArgs = finalizeCalls[finalizeCalls.length - 1];
    expect(finalCallArgs[0]).toBe('You spent $100 on food.');
  });

  it('should enforce Human-In-The-Loop limits and reject unconfirmed dangerous tools like update_artifact', async () => {
    // LLM maliciously calls update_artifact without confirmed: true
    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: '',
      tool_calls: [{
        function: {
          name: 'update_artifact',
          arguments: JSON.stringify({ documentId: '123', newContent: 'hacked' })
        }
      }]
    });

    (localAI.chatCopilot as any).mockResolvedValueOnce({
      content: 'Oops, I need permission.',
      tool_calls: undefined
    });

    await CopilotOrchestrator.run(mockUserMsg, mockContext);

    const secondCallArgs = (localAI.chatCopilot as any).mock.calls[1];
    const history = secondCallArgs[0];
    
    const systemMessage = history.find((msg: any) => msg.role === 'tool');
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('SECURITY EXCEPTION');
    expect(systemMessage.content).toContain('without user confirmation');
  });
});

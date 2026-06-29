import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageLoansTool } from '../ManageLoansTool';
import { api } from '../../../api';

vi.mock('../../../api', () => ({
  api: {
    getLoans: vi.fn(),
    addLoan: vi.fn(),
    updateLoan: vi.fn(),
    deleteLoan: vi.fn()
  }
}));

describe('ManageLoansTool', () => {
  let tool: ManageLoansTool;

  beforeEach(() => {
    tool = new ManageLoansTool();
    vi.clearAllMocks();
  });

  it('should allow GET action without confirmation', async () => {
    (api.getLoans as any).mockResolvedValue([{ id: 1, name: 'House' }]);
    
    const result = await tool.execute({ action: 'get' }, {} as any);
    
    expect(result.feedbackError).toBeUndefined();
    expect(result.data?.loans).toHaveLength(1);
    expect(result.actionResult?.action).toBe('get_loans');
  });

  it('should block CREATE action if not confirmed', async () => {
    const result = await tool.execute({ action: 'create', loanData: {} }, {} as any);
    
    expect(result.feedbackError).toContain('SECURITY EXCEPTION');
  });

  it('should allow CREATE action if confirmed and validate fields', async () => {
    // Missing fields
    const badResult = await tool.execute({ action: 'create', confirmed: true, loanData: { name: 'Test' } }, {} as any);
    expect(badResult.feedbackError).toContain('Missing required loan fields');

    // Valid fields
    (api.addLoan as any).mockResolvedValue(99);
    const goodResult = await tool.execute({ 
      action: 'create', 
      confirmed: true, 
      loanData: { 
        name: 'Test', type: 'house', principal: 1000, rate: 5, termYears: 30, startDate: '2023-01-01', category: 'Mortgage' 
      } 
    }, {} as any);
    
    expect(goodResult.feedbackError).toBeUndefined();
    expect(goodResult.actionResult?.id).toBe(99);
    expect(api.addLoan).toHaveBeenCalled();
  });
});

import type { ChatMessage } from './ai';

export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  food: ['Groceries', 'Restaurants & Coffee'],
  dining: ['Restaurants & Coffee'],
  dinner: ['Restaurants & Coffee'],
  lunch: ['Restaurants & Coffee'],
  cafe: ['Restaurants & Coffee'],
  coffee: ['Restaurants & Coffee'],
  groceries: ['Groceries'],
  supermarket: ['Groceries'],
  utilities: ['Utilities'],
  utility: ['Utilities'],
  bills: ['Utilities'],
  bill: ['Utilities'],
  power: ['Utilities'],
  water: ['Utilities'],
  gas: ['Utilities', 'Transportation'],
  internet: ['Utilities'],
  phone: ['Utilities'],
  subscriptions: ['Subscriptions'],
  subscription: ['Subscriptions'],
  netflix: ['Subscriptions'],
  spotify: ['Subscriptions'],
  entertainment: ['Entertainment'],
  transport: ['Transportation'],
  transportation: ['Transportation'],
  transit: ['Transportation'],
  car: ['Transportation', 'Auto Loan'],
  travel: ['Travel'],
  housing: ['Housing'],
  rent: ['Housing'],
  mortgage: ['Mortgage'],
};

export function matchCategories(requested: string[], categories: { name: string }[]): string[] {
  const desiredNames = new Set<string>();
  for (const req of requested) {
    const reqNorm = req.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    
    // 1. Check synonym dictionary
    if (CATEGORY_SYNONYMS[reqNorm]) {
      for (const catName of CATEGORY_SYNONYMS[reqNorm]) {
        desiredNames.add(catName);
      }
      continue;
    }

    // 2. Fuzzy match against actual category names
    const matchedCat = categories.find((c) => {
      const cNorm = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        cNorm === reqNorm ||
        cNorm.includes(reqNorm) ||
        reqNorm.includes(cNorm)
      );
    });
    if (matchedCat) {
      desiredNames.add(matchedCat.name);
    }
  }
  return Array.from(desiredNames);
}

export function matchAccounts(requested: (string | number)[], accounts: { name: string; id?: number }[]): number[] {
  const desiredAccountIds = new Set<number>();
  for (const req of requested) {
    const reqNorm = String(req).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const matchedAcct = accounts.find((a) => {
      const aNorm = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const aIdStr = String(a.id);
      return (
        aNorm === reqNorm ||
        aNorm.includes(reqNorm) ||
        reqNorm.includes(aNorm) ||
        aIdStr === reqNorm
      );
    });
    if (matchedAcct && matchedAcct.id !== undefined) {
      desiredAccountIds.add(matchedAcct.id);
    }
  }
  return Array.from(desiredAccountIds);
}

export function cleanChatHistory(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];

  // Find the index of the last user message. Any messages after this index
  // are part of the current active ReAct loop and must be preserved exactly as-is.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    // If the message is part of the current turn's active loop, preserve it completely.
    if (i >= lastUserIdx && lastUserIdx !== -1) {
      cleaned.push(m);
      continue;
    }

    if (m.role === 'system') {
      // Skip all system results messages from previous turns.
      continue;
    }

    if (m.role === 'assistant') {
      try {
        let jsonStr = m.content.trim();
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1].trim();
        } else {
          const start = jsonStr.indexOf('{');
          const end = jsonStr.lastIndexOf('}');
          if (start >= 0 && end >= 0) {
            jsonStr = jsonStr.slice(start, end + 1);
          }
        }
        const parsed = JSON.parse(jsonStr);
        const action = parsed?.agent_action?.action || parsed?.action;

        // Skip Stage 1 intermediate assistant query messages (which have a query action but no actionResult)
        if (action && action !== 'none' && action !== 'filter' && action !== 'navigate' && !m.actionResult) {
          continue;
        }

        // Clean Stage 2 assistant messages or final responses to plain text body/explanation
        if (parsed.body) {
          cleaned.push({ role: 'assistant' as const, content: parsed.body });
          continue;
        }
        if (parsed.explanation) {
          cleaned.push({ role: 'assistant' as const, content: parsed.explanation });
          continue;
        }
      } catch {
        // Fall back to original content if not JSON
      }
    }

    cleaned.push(m);
  }

  return cleaned;
}

export function getMonthsInRange(startDateStr: string, endDateStr: string): number {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  if (isNaN(sy) || isNaN(sm) || isNaN(sd) || isNaN(ey) || isNaN(em) || isNaN(ed)) {
    return 1;
  }
  const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const end = new Date(ey, em - 1, ed, 0, 0, 0, 0);

  const isStartOfAnyMonth = sd === 1;
  const nextDayOfEnd = new Date(ey, em - 1, ed + 1, 0, 0, 0, 0);
  const isEndOfAnyMonth = nextDayOfEnd.getDate() === 1;

  if (isStartOfAnyMonth && isEndOfAnyMonth) {
    const yearDiff = ey - sy;
    const monthDiff = em - sm;
    return Math.max(1, yearDiff * 12 + monthDiff + 1);
  }

  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0.01, diffDays / 30);
}

export function calculateBudgetStatus(
  totalSpend: number,
  monthlyBudget: number,
  numMonths: number
): { scaledBudget: number; difference: number; isOverBudget: boolean; statusText: string } {
  const scaledBudget = monthlyBudget * numMonths;
  const difference = scaledBudget - totalSpend;
  const isOverBudget = totalSpend > scaledBudget;
  const formattedMonths = numMonths % 1 === 0 ? numMonths.toString() : numMonths.toFixed(2);
  let statusText = '';
  if (scaledBudget > 0) {
    if (isOverBudget) {
      statusText = `OVER budget by $${(totalSpend - scaledBudget).toFixed(2)} (Spent: $${totalSpend.toFixed(2)}, scaled budget for ${formattedMonths} month(s) is $${scaledBudget.toFixed(2)})`;
    } else {
      statusText = `UNDER/WITHIN budget by $${difference.toFixed(2)} (Spent: $${totalSpend.toFixed(2)}, scaled budget for ${formattedMonths} month(s) is $${scaledBudget.toFixed(2)})`;
    }
  } else {
    statusText = `No budget set for these categories.`;
  }
  return { scaledBudget, difference, isOverBudget, statusText };
}

export interface AggregatedResults {
  totalSpend: number;
  totalIncome: number;
  spendCount: number;
  incomeCount: number;
  spendAverage: number;
  incomeAverage: number;
  scaledBudget: number;
  difference: number;
  isOverBudget: boolean;
  statusText: string;
}

export function aggregateTransactions(
  transactions: { category: string; amount: number }[],
  categoryTypes: Record<string, string>,
  monthlyBudget: number,
  numMonths: number
): AggregatedResults {
  let totalSpend = 0;
  let totalIncome = 0;
  let spendCount = 0;
  let incomeCount = 0;

  for (const t of transactions) {
    const type = categoryTypes[t.category.toLowerCase()] || 'spend';
    if (type === 'income') {
      totalIncome += t.amount;
      incomeCount++;
    } else if (type === 'spend') {
      totalSpend += -t.amount;
      spendCount++;
    } else {
      if (t.amount < 0) {
        totalSpend += -t.amount;
        spendCount++;
      }
    }
  }

  const spendAverage = spendCount > 0 ? totalSpend / spendCount : 0;
  const incomeAverage = incomeCount > 0 ? totalIncome / incomeCount : 0;

  const { scaledBudget, difference, isOverBudget, statusText } = calculateBudgetStatus(
    totalSpend,
    monthlyBudget,
    numMonths
  );

  return {
    totalSpend,
    totalIncome,
    spendCount,
    incomeCount,
    spendAverage,
    incomeAverage,
    scaledBudget,
    difference,
    isOverBudget,
    statusText,
  };
}

export interface CommandExecutorContext {
  categories: { name: string }[];
  accounts: { name: string; id?: number }[];
  currentPath: string;
  navigate: (path: string) => void;
  setPreset: (preset: any) => void;
  setCustomRange: (start?: string, end?: string) => void;
  setDisabledCategories: (cats: string[]) => void;
  setEnabledAccounts: (ids: number[]) => void;
  setSearchQuery: (q: string) => void;
  setMinPrice: (price?: number) => void;
  setMaxPrice: (price?: number) => void;
}

export function executeCopilotCommand(cmd: any, ctx: CommandExecutorContext) {
  if (cmd.page && cmd.page !== ctx.currentPath) {
    ctx.navigate(cmd.page);
  }

  const startVal = cmd.customStart || cmd.startDate;
  const endVal = cmd.customEnd || cmd.endDate;
  if (cmd.preset === 'custom' || startVal || endVal) {
    ctx.setCustomRange(startVal || undefined, endVal || undefined);
  } else if (cmd.preset) {
    ctx.setPreset(cmd.preset);
  }

  // If merchant search is specified, reset checkboxes to show everything by default.
  if (
    (cmd.search !== undefined && cmd.search !== null && cmd.search !== '') ||
    (cmd.query !== undefined && cmd.query !== null && cmd.query !== '')
  ) {
    if (!cmd.categories || cmd.categories.length === 0) {
      ctx.setDisabledCategories([]);
    }
    if (!cmd.accounts || cmd.accounts.length === 0) {
      ctx.setEnabledAccounts(ctx.accounts.map((a) => a.id!));
    }
  }

  // Apply merchant search query if specified, otherwise clear it if category/account/preset filters are active.
  if (cmd.search !== undefined) {
    ctx.setSearchQuery(cmd.search || '');
  } else if (cmd.query !== undefined) {
    ctx.setSearchQuery(cmd.query || '');
  } else if (cmd.categories || cmd.accounts || cmd.preset) {
    ctx.setSearchQuery('');
  }

  if (cmd.categories && Array.isArray(cmd.categories)) {
    if (cmd.categories.includes('all') || cmd.categories.length === 0) {
      ctx.setDisabledCategories([]);
    } else {
      const matched = matchCategories(cmd.categories, ctx.categories);
      const toDisable = ctx.categories
        .filter((c) => !matched.includes(c.name))
        .map((c) => c.name);
      ctx.setDisabledCategories(toDisable);
    }
  }

  if (cmd.accounts && Array.isArray(cmd.accounts)) {
    if (cmd.accounts.includes('all') || cmd.accounts.length === 0) {
      ctx.setEnabledAccounts(ctx.accounts.map((a) => a.id!));
    } else {
      const matchedIds = matchAccounts(cmd.accounts, ctx.accounts);
      ctx.setEnabledAccounts(matchedIds);
    }
  }

  if (cmd.minPrice !== undefined) {
    ctx.setMinPrice(cmd.minPrice === null || cmd.minPrice === 0 ? undefined : cmd.minPrice);
  }
  if (cmd.maxPrice !== undefined) {
    ctx.setMaxPrice(cmd.maxPrice === null || cmd.maxPrice === 0 ? undefined : cmd.maxPrice);
  }

  // Reset price filters on explicit reset all filters action
  if (
    cmd.categories && (cmd.categories.includes('all') || cmd.categories.length === 0) &&
    cmd.accounts && (cmd.accounts.includes('all') || cmd.accounts.length === 0) &&
    (cmd.search === '' || cmd.search === undefined) &&
    cmd.preset === 'allTime'
  ) {
    ctx.setMinPrice(undefined);
    ctx.setMaxPrice(undefined);
  }
}

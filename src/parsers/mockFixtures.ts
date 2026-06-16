export function getChaseMockCsv(): string {
  const lines = [
    'Card Member,Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    'JOHN DOE,05/22/2026,05/23/2026,Payment Thank You - Web,Food,Payment,540.82,',
    'JOHN DOE,05/21/2026,05/22/2026,YouTube Premium Membership,Bills & Utilities,Sale,-14.99,'
  ];
  // Fill up to 25 rows to satisfy > 20 and < 40 requirement
  for (let i = 1; i <= 23; i++) {
    lines.push(`JOHN DOE,05/15/2026,05/16/2026,Generic Merchant ${i},Shopping,Sale,-10.00,`);
  }
  return lines.join('\n');
}

export function getBoaCreditMockCsv(): string {
  const lines = [
    'Some bank header or description before data starts',
    'CardHolder Name,Account/Card Number - last 4 digits,Posting Date,Trans. Date,Reference ID,Description,Amount,MCC,Merchant Category,Transaction Type,Expense Category',
    'John Doe,1234,05/10/2026,05/09/2026,REF1,PAYMENT - THANK YOU,-39.99,0000,Payments,Credit,Payments',
    'Jane Smith,5678,05/12/2026,05/11/2026,REF2,LinkedIn Corporation,39.99,7379,Business,Sale,Business Services'
  ];
  // Fill up to 45 rows to satisfy > 40 requirement
  for (let i = 1; i <= 43; i++) {
    const cardholder = i % 2 === 0 ? 'John Doe' : 'Jane Smith';
    const last4 = i % 2 === 0 ? '1234' : '5678';
    lines.push(`${cardholder},${last4},05/14/2026,05/13/2026,REF${i+2},Generic Payee ${i},15.00,0000,Retail,Sale,Shopping`);
  }
  return lines.join('\n');
}

export function getBoaCheckingMockCsv(): string {
  const lines = [
    'Beginning balance as of 05/01/2026 is $1000.00',
    'Date,Description,Amount,Running Bal.',
    '05/01/2026,Beginning balance,0.00,1000.00',
    '05/02/2026,CLAUDE.AI - ANTHROPIC,-20.00,980.00',
    '05/14/2026,Ending balance,0.00,980.00'
  ];
  // Fill up to 505 rows to satisfy > 500 requirement
  for (let i = 1; i <= 502; i++) {
    lines.splice(2, 0, `05/05/2026,Debit Card Transaction ${i},-5.00,${980 - i * 5}`);
  }
  return lines.join('\n');
}

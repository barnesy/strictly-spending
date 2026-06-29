const Papa = require('papaparse');
const result = Papa.parse("IRS Schedule C Category,Gross Spend,Deductible Spend\nTOTAL EXPENSES,0.00,0.00", { header: false });
console.log(JSON.stringify(result, null, 2));

export const formatCurrency = (val: number) =>
  `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDateRange = (startStr: string, endStr: string, action: string) => {
  if (!startStr || !endStr) {
    if (action === 'subscription_alerts') {
      return 'All-Time Subscription Monitoring';
    }
    return 'All-Time History';
  }
  try {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error();
    }
    return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
  } catch {
    return `${startStr} to ${endStr}`;
  }
};

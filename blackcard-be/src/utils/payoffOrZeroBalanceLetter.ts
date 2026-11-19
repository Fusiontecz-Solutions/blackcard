/** True when a payment letter/template name is Payoff or Zero Balance (PDF attachment allowed). */
export function isPayoffOrZeroBalanceLetterTemplate(templateName: string): boolean {
  const n = String(templateName || '').trim().toLowerCase();
  return (
    n === 'zero balance letter' ||
    n.includes('zero balance') ||
    n.includes('payoff') ||
    n.includes('pay off')
  );
}

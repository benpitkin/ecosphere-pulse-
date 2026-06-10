// Business-advice items shown on the Advice page.
// NOTE: the old Capital-on-Tap advice item was removed after refinancing.
// TODO: port the real rules. See docs/HANDOVER.md §5/§7.
export interface AdviceItem {
  title: string;
  detail: string;
}

export async function getAdvice(): Promise<AdviceItem[]> {
  return [];
}

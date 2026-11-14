import type { FinanceService } from '../finance/finance-service';

export type FinanceSnapshot = Awaited<ReturnType<FinanceService['snapshot']>>;

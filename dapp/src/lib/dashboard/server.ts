import 'server-only';

import { dashboardSummaryDependencies } from './default-dependencies';
import {
  buildDashboardSummary,
  type DashboardIdentity,
  type DashboardRuntime,
  type DashboardSummaryDependencies,
} from './summary';

export function getDashboardSummary(
  input: { identity: DashboardIdentity; runtime: DashboardRuntime },
  dependencies: DashboardSummaryDependencies = dashboardSummaryDependencies(),
) {
  return buildDashboardSummary({ ...input, dependencies });
}

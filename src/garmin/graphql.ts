import { parse, type OperationDefinitionNode } from 'graphql';

export const ALLOWED_GRAPHQL_ROOTS = new Set([
  'activitiesScalar', 'activityStatsScalar', 'activityTrendsScalar',
  'adhocChallengePendingInviteScalar', 'adhocChallengesScalar', 'badgeChallengesScalar', 'expeditionsChallengesScalar',
  'bloodPressureScalar', 'calorieSummaryDailyStats', 'criticalSwimSpeedScalar', 'cyclingAbility',
  'dailyEventsScalar', 'enduranceScoreScalar', 'epochChartScalar', 'functionalThresholdPowerScalar',
  'golfScorecardScalar', 'healthSnapshotScalar', 'healthStatusSummary', 'heartRateScalar',
  'heartRateVariabilityScalar', 'heatAltitudeAcclimationScalar', 'hillScoreScalar', 'jetLagScalar',
  'latestFitnessAgeScalar', 'latestWeightScalar', 'lifestyleLoggingStats', 'menstrualCycleScalar',
  'menstrualCycleDetail', 'myDayCardEventsScalar', 'pendingActivities', 'personalRecordsScalar',
  'powerToWeightScalar', 'pregnancyScalar', 'runningEconomy', 'runningLactateThresholdScalar',
  'runningToleranceStats', 'searchActivitiesScalar', 'sleepScalar', 'sleepSummariesScalar',
  'spO2AcclimationScalar', 'trainingLoadBalanceScalar', 'trainingPlanScalar', 'trainingReadinessRangeScalar',
  'trainingStatusDailyScalar', 'trainingStatusWeeklyScalar', 'userDailySummaryV2Scalar',
  'userDailySummaryV2AverageScalar', 'userGoalsScalar', 'vo2MaxScalar', 'weightScalar',
  'workoutScheduleSummariesScalar',
]);

export function validateGarminGraphql(query: string): void {
  if (query.length > 30_000) throw new Error('GraphQL query is too large');
  const document = parse(query);
  const operations = document.definitions.filter((definition): definition is OperationDefinitionNode => definition.kind === 'OperationDefinition');
  if (operations.length !== 1 || document.definitions.some((definition) => !['OperationDefinition', 'FragmentDefinition'].includes(definition.kind))) {
    throw new Error('Send exactly one Garmin query operation');
  }
  const operation = operations[0];
  if (!operation || operation.operation !== 'query') throw new Error('GraphQL mutations and subscriptions are not allowed');
  if (operation.selectionSet.selections.length < 1 || operation.selectionSet.selections.length > 5) throw new Error('Request one to five known Garmin root fields');
  for (const selection of operation.selectionSet.selections) {
    if (selection.kind !== 'Field' || !ALLOWED_GRAPHQL_ROOTS.has(selection.name.value)) {
      throw new Error('GraphQL root field is not in the Garmin read-only allowlist');
    }
  }
}

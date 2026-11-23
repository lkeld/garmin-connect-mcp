/**
 * Declarative map of the Garmin Connect requests used by python-garminconnect.
 *
 * This is data for our HTTP runtime, not a client and not a live-verification
 * claim. Source: python-garminconnect commit
 * 82bc11073b597d20f8b080b7aeaac8d4cef4fc3e (2026-10-31), plus its endpoint
 * and GraphQL documentation.
 *
 * Paths are relative to the region's connectapi origin unless absolute. The
 * runtime substitutes and percent-encodes every `{pathParam}` (including
 * `{displayName}`), supplies today in the user's Garmin timezone for a
 * `defaulted("date", "today")` value, copies `{startDate}` when that
 * sentinel is used, repeats array query parameters, and serializes booleans in lowercase. `{domain}` is `garmin.com` for `global`
 * and `garmin.cn` for `china`. A few composite Python methods need additional
 * orchestration described in `notes`.
 */

export type Region = "global" | "china";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type BodyType = "json" | "text" | "form" | "multipart" | "download";
export type QueryType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "string[]"
  | "integer[]"
  | "unknown";
export type QueryDefault =
  | string
  | number
  | boolean
  | null
  | readonly (string | number)[];
export type VerificationStatus = "yes" | "yes-empty" | "no" | "not-documented";

export const CATEGORIES = [
  "profile",
  "activities",
  "health",
  "metrics",
  "body",
  "achievements",
  "gear",
  "devices",
  "workouts",
  "training",
  "calendar",
  "courses",
  "reports",
  "womens-health",
  "golf",
  "nutrition",
  "graphql",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface QueryParameterDefinition {
  type: QueryType;
  required: boolean;
  /** `null` means omitted when the Python argument is None. */
  default?: QueryDefault;
  description?: string;
}

export interface EndpointDefinition {
  /** Python method name, or `<method>.<variant>` for a distinct request variant. */
  id: string;
  title: string;
  category: Category;
  description: string;
  method: HttpMethod;
  path: string;
  params: Readonly<Record<string, QueryParameterDefinition>>;
  pathParams: readonly string[];
  body: BodyType | null;
  bodyDescription?: string;
  write: boolean;
  destructive: boolean;
  download: boolean;
  notes: string;
  /** Status in reference docs; `not-documented` is not a negative live result. */
  verified: VerificationStatus;
}

type EndpointInput = Omit<
  EndpointDefinition,
  | "category"
  | "params"
  | "pathParams"
  | "body"
  | "write"
  | "destructive"
  | "download"
  | "notes"
  | "verified"
> &
  Partial<
    Pick<
      EndpointDefinition,
      | "params"
      | "pathParams"
      | "body"
      | "write"
      | "destructive"
      | "download"
      | "notes"
      | "verified"
    >
  >;

/** Required query parameter. */
const r = (type: QueryType, description?: string): QueryParameterDefinition => ({
  type,
  required: true,
  ...(description === undefined ? {} : { description }),
});

/** Optional query parameter, omitted when its value is null. */
const o = (type: QueryType, description?: string): QueryParameterDefinition => ({
  type,
  required: false,
  default: null,
  ...(description === undefined ? {} : { description }),
});

/** Query parameter always sent, with the Python method's default. */
const d = (
  type: QueryType,
  value: QueryDefault,
  description?: string,
): QueryParameterDefinition => ({
  type,
  required: true,
  default: value,
  ...(description === undefined ? {} : { description }),
});

const e = (category: Category, input: EndpointInput): EndpointDefinition => ({
  ...input,
  category,
  params: input.params ?? {},
  pathParams: input.pathParams ?? [],
  body: input.body ?? null,
  write: input.write ?? false,
  destructive: input.destructive ?? false,
  download: input.download ?? false,
  notes: input.notes ?? "",
  verified: input.verified ?? "not-documented",
});

export const ENDPOINTS: readonly EndpointDefinition[] = [
  // Profile and account (base.py)
  e("profile", {
    id: "get_user_timezone", title: "Get user timezone",
    description: "Read the IANA timezone from the authenticated profile.",
    method: "GET", path: "/userprofile-service/userprofile/personal-information/{displayName}",
    pathParams: ["displayName"], verified: "yes",
    notes: "Requires displayName. The Python helper caches only timeZone; get_personal_information exposes the full record.",
  }),
  e("profile", {
    id: "get_user_profile", title: "Get user settings",
    description: "Return user data, units, formats, sleep times, and training settings.",
    method: "GET", path: "/userprofile-service/userprofile/user-settings",
  }),
  e("profile", {
    id: "get_userprofile_settings", title: "Get profile preferences",
    description: "Return display name, locale, and profile preferences.",
    method: "GET", path: "/userprofile-service/userprofile/settings",
  }),
  e("profile", {
    id: "update_user_settings", title: "Update user settings",
    description: "Merge changes into account settings and nested userData.",
    method: "PUT", path: "/userprofile-service/userprofile/user-settings",
    body: "json", bodyDescription: "Current settings overlaid with requested changes; userData is merged one level deep.",
    write: true, verified: "yes",
    notes: "Runtime must GET current settings before shaping the merged body.",
  }),
  e("profile", {
    id: "set_primary_training_device", title: "Set primary training device",
    description: "Select the device Garmin uses as the primary training device.",
    method: "PUT", path: "/userprofile-service/userprofile/user-settings/primary-training-device",
    body: "json", bodyDescription: "{ deviceId }.", write: true, verified: "yes",
  }),
  e("profile", {
    id: "request_reload", title: "Request wellness reload",
    description: "Request regeneration of offloaded wellness data for a date, optionally for one device.",
    method: "POST", path: "/wellness-service/wellness/epoch/request/{date}",
    pathParams: ["date"], write: true,
    notes: "When deviceId is supplied, append /{deviceId}; this optional path segment requires runtime dispatch.",
  }),
  e("profile", {
    id: "get_personal_information", title: "Get personal information",
    description: "Return user information, biometric profile, and VO2 max.",
    method: "GET", path: "/userprofile-service/userprofile/personal-information/{displayName}",
    params: { includeBiometric: d("boolean", true), includeVO2Max: d("boolean", true) },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("profile", {
    id: "get_user_profile_base", title: "Get base profile",
    description: "Return names, birth date, account creation date, and related base fields.",
    method: "GET", path: "/userprofile-service/userprofile/userProfileBase", verified: "yes",
  }),
  e("profile", {
    id: "get_privacy_settings", title: "Get privacy settings",
    description: "Return activity, profile, and wellness privacy settings.",
    method: "GET", path: "/privacysettings-service/privacy-settings", verified: "yes",
  }),
  e("profile", {
    id: "get_usage_indicators", title: "Get supported feature indicators",
    description: "Return features supported by the account's devices and data.",
    method: "GET", path: "/web-gateway/snapshot/usageIndicators", verified: "yes",
  }),

  // Activities (activities.py, plus one metrics.py activity subresource)
  e("activities", {
    id: "count_activities", title: "Count activities",
    description: "Return the account's total activity count.",
    method: "GET", path: "/activitylist-service/activities/count",
  }),
  e("activities", {
    id: "get_activities", title: "List activities",
    description: "Return a newest-first page of activities with optional type filters.",
    method: "GET", path: "/activitylist-service/activities/search/activities",
    params: {
      start: d("integer", 0), limit: d("integer", 20),
      activityType: o("string"),
      activitySubType: o("string", "Only sent when activityType is present."),
    },
  }),
  e("activities", {
    id: "get_activities_fordate", title: "Get activities for date",
    description: "Return available activity heart-rate records for a date.",
    method: "GET", path: "/mobile-gateway/heartRate/forDate/{date}", pathParams: ["date"],
  }),
  e("activities", {
    id: "update_activity", title: "Update activity",
    description: "Apply a partial edit to activity metadata, type, event, privacy, name, or description.",
    method: "PUT", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], body: "json",
    bodyDescription: "{ activityId, ...fields }; field shapes mirror get_activity.",
    write: true, verified: "yes", notes: "Custom body shaping adds activityId to the supplied fields.",
  }),
  e("activities", {
    id: "set_activity_name", title: "Rename activity",
    description: "Set an activity's display name.",
    method: "PUT", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], body: "json", bodyDescription: "{ activityId, activityName }.", write: true,
  }),
  e("activities", {
    id: "set_activity_type", title: "Change activity type",
    description: "Change an activity's type and parent type identifiers.",
    method: "PUT", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], body: "json",
    bodyDescription: "{ activityId, activityTypeDTO: { typeId, typeKey, parentTypeId } }.", write: true,
  }),
  e("activities", {
    id: "set_activity_description", title: "Set activity description",
    description: "Replace an activity's description.",
    method: "PUT", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], body: "json", bodyDescription: "{ activityId, description }.", write: true,
  }),
  e("activities", {
    id: "create_manual_activity_from_json", title: "Create manual activity",
    description: "Create an activity from a complete Garmin activity object.",
    method: "POST", path: "/activity-service/activity", body: "json",
    bodyDescription: "Complete activity payload.", write: true,
  }),
  e("activities", {
    id: "create_manual_activity", title: "Create simple manual activity",
    description: "Create a private manual activity from basic local time, sport, distance, and duration values.",
    method: "POST", path: "/activity-service/activity", body: "json",
    bodyDescription: "Synthetic activityTypeDTO, private accessControlRuleDTO, timezone, name, metadataDTO, and summaryDTO.",
    write: true,
    notes: "Runtime converts kilometers to meters and minutes to seconds and builds the nested body.",
  }),
  e("activities", {
    id: "get_last_activity", title: "Get latest activity",
    description: "Return the most recent activity or null.",
    method: "GET", path: "/activitylist-service/activities/search/activities",
    params: { start: d("integer", 0), limit: d("integer", 1) },
    notes: "Composite of get_activities(0, 1); handles both list and activityList response shapes.",
  }),
  e("activities", {
    id: "upload_activity", title: "Upload activity",
    description: "Upload a FIT, GPX, or TCX activity as a device-synced activity.",
    method: "POST", path: "/upload-service/upload", body: "multipart",
    bodyDescription: "Multipart field `file` containing the activity file.",
    write: true, verified: "yes",
    notes: "Requires local file streaming, filename/extension validation, and multipart handling.",
  }),
  e("activities", {
    id: "import_activity", title: "Import activity",
    description: "Import a FIT, GPX, or TCX file without third-party re-export behavior.",
    method: "POST", path: "/upload-service/upload/{extension}", body: "multipart",
    pathParams: ["extension"], bodyDescription: "Multipart field `file` with application/octet-stream content.",
    write: true,
    notes: "Requires NK: NT, SSO origin, and GCM-iOS User-Agent headers; handle 409 as a duplicate.",
  }),
  e("activities", {
    id: "delete_activity", title: "Delete activity",
    description: "Permanently delete an activity.",
    method: "DELETE", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], write: true, destructive: true,
  }),
  e("activities", {
    id: "get_activities_by_date", title: "List activities by date",
    description: "Return all activities in a date range, optionally filtered and sorted.",
    method: "GET", path: "/activitylist-service/activities/search/activities",
    params: {
      startDate: r("date"), start: d("integer", 0), limit: d("integer", 20),
      endDate: o("date"), activityType: o("string"), sortOrder: o("string"),
    },
    notes: "Runtime paginates by 20 until an empty page and must cap pagination.",
  }),
  e("activities", {
    id: "get_progress_summary_between_dates", title: "Summarize activity progress",
    description: "Aggregate distance, duration, elevation, or moving duration over a range.",
    method: "GET", path: "/fitnessstats-service/activity",
    params: {
      startDate: r("date"), endDate: r("date"), aggregation: d("string", "lifetime"),
      groupByParentActivityType: d("boolean", true), metric: d("string", "distance"),
    },
    verified: "yes",
  }),
  e("activities", {
    id: "get_training_load_activities", title: "Get activity training load",
    description: "Return activities with requested training-load metrics for a range.",
    method: "GET", path: "/fitnessstats-service/activity/all",
    params: {
      startDate: r("date"), endDate: r("date"),
      metric: d("string[]", ["activityTrainingLoad", "trainingEffectLabel", "trainingEffectLabelSrvrCalc"]),
      activityType: o("string"),
    },
    notes: "An explicitly empty metrics list is preserved rather than replaced by defaults.",
  }),
  e("activities", {
    id: "get_activity_types", title: "List activity types",
    description: "Return activity types and their parent types.",
    method: "GET", path: "/activity-service/activity/activityTypes",
  }),
  e("activities", {
    id: "download_activity", title: "Download activity as TCX",
    description: "Download activity TCX bytes; this is the Python default format.",
    method: "GET", path: "/download-service/export/tcx/activity/{activityId}",
    pathParams: ["activityId"], body: "download", bodyDescription: "TCX bytes.", download: true,
    notes: "Format dispatch also supports the four following variant entries.",
  }),
  e("activities", {
    id: "download_activity.original", title: "Download original activity",
    description: "Download the original activity upload as a ZIP archive.",
    method: "GET", path: "/download-service/files/activity/{activityId}",
    pathParams: ["activityId"], body: "download", bodyDescription: "ZIP bytes.", download: true,
  }),
  e("activities", {
    id: "download_activity.gpx", title: "Download activity as GPX",
    description: "Download an activity track as GPX.",
    method: "GET", path: "/download-service/export/gpx/activity/{activityId}",
    pathParams: ["activityId"], body: "download", bodyDescription: "GPX bytes.", download: true,
  }),
  e("activities", {
    id: "download_activity.kml", title: "Download activity as KML",
    description: "Download an activity track as KML.",
    method: "GET", path: "/download-service/export/kml/activity/{activityId}",
    pathParams: ["activityId"], body: "download", bodyDescription: "KML bytes.", download: true,
  }),
  e("activities", {
    id: "download_activity.csv", title: "Download activity splits as CSV",
    description: "Download activity split data as CSV.",
    method: "GET", path: "/download-service/export/csv/activity/{activityId}",
    pathParams: ["activityId"], body: "download", bodyDescription: "CSV bytes.", download: true,
  }),
  e("activities", {
    id: "get_activity_splits", title: "Get activity splits",
    description: "Return activity split details.",
    method: "GET", path: "/activity-service/activity/{activityId}/splits", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_typed_splits", title: "Get typed activity splits",
    description: "Return sport-specific typed split details.",
    method: "GET", path: "/activity-service/activity/{activityId}/typedsplits", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_split_summaries", title: "Get split summaries",
    description: "Return summaries for an activity's splits.",
    method: "GET", path: "/activity-service/activity/{activityId}/split_summaries", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_weather", title: "Get activity weather",
    description: "Return weather associated with an activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/weather", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_hr_in_timezones", title: "Get activity HR zones",
    description: "Return time spent in each heart-rate zone.",
    method: "GET", path: "/activity-service/activity/{activityId}/hrTimeInZones", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_power_in_timezones", title: "Get activity power zones",
    description: "Return time spent in each power zone.",
    method: "GET", path: "/activity-service/activity/{activityId}/powerTimeInZones", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity", title: "Get activity",
    description: "Return activity summary metadata and basic splits.",
    method: "GET", path: "/activity-service/activity/{activityId}", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_details", title: "Get activity chart details",
    description: "Return detailed activity charts and polyline data.",
    method: "GET", path: "/activity-service/activity/{activityId}/details",
    params: { maxChartSize: d("integer", 2000), maxPolylineSize: d("integer", 4000) },
    pathParams: ["activityId"],
  }),
  e("activities", {
    id: "get_activity_images", title: "Get activity images",
    description: "Extract attached photo metadata and expiring image URLs from an activity.",
    method: "GET", path: "/activity-service/activity/{activityId}", pathParams: ["activityId"],
    notes: "Composite of get_activity; reads metadataDTO.activityImages. Presigned S3 URLs expire after 24 hours.",
  }),
  e("activities", {
    id: "get_activity_exercise_sets", title: "Get exercise sets",
    description: "Return strength-training exercise sets for an activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/exerciseSets", pathParams: ["activityId"],
  }),
  e("activities", {
    id: "set_activity_exercise_sets", title: "Replace exercise sets",
    description: "Replace all strength-training exercise sets on an activity.",
    method: "PUT", path: "/activity-service/activity/{activityId}/exerciseSets",
    pathParams: ["activityId"], body: "json",
    bodyDescription: "Full get_activity_exercise_sets-shaped object with the replacement exerciseSets array.",
    write: true, destructive: true,
    notes: "Replace-all semantics; Garmin validates exercise category and name against FIT enums.",
  }),
  e("activities", {
    id: "get_available_metrics", title: "List available fitness metrics",
    description: "Return progress-summary metrics available per activity type.",
    method: "GET", path: "/fitnessstats-service/activity/availableMetrics",
    params: { startDate: r("date"), endDate: r("date"), activityType: o("string[]") }, verified: "yes",
  }),
  e("activities", {
    id: "get_weekly_activity_stats", title: "Get weekly activity statistics",
    description: "Return weekly activity aggregates such as VO2 max, distance, and duration.",
    method: "GET", path: "/userstats-service/activities/weekly/{displayName}",
    params: {
      fromWeekStartDate: r("date"), untilWeekStartDate: r("date"), grpActType: d("boolean", true),
    },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("activities", {
    id: "search_activities", title: "Search activities",
    description: "Search activities with the web application's full filter set.",
    method: "GET", path: "/activitylist-service/activities/search/activities",
    params: {
      start: d("integer", 0), limit: d("integer", 20), activityType: o("string"),
      activitySubType: o("string"), startDate: o("date"), endDate: o("date"),
      search: o("string"), favorite: o("integer"), sortBy: o("string"), sortOrder: o("string"),
      minDistance: o("number"), maxDistance: o("number"), minDuration: o("number"),
      maxDuration: o("number"), minElevation: o("number"), maxElevation: o("number"),
      eventType: o("string"), excludeChildren: o("boolean"),
    },
    verified: "yes", notes: "Python also passes through additional validated alphanumeric filter names.",
  }),
  e("activities", {
    id: "get_fastest_splits", title: "Get fastest splits",
    description: "Return best times per distance in a date range.",
    method: "GET", path: "/activitylist-service/activities/fastest-splits",
    params: {
      numberOfBests: d("integer", 10), startDate: r("date"), endDate: r("date"),
      activityType: d("string", "running"),
    },
    verified: "yes",
  }),
  e("activities", {
    id: "get_favorite_activities", title: "List favorite activities",
    description: "Return activities marked as favorite.",
    method: "GET", path: "/activitylist-service/activities/favorite/{displayName}",
    params: { limit: d("integer", 5) }, pathParams: ["displayName"], verified: "yes-empty",
    notes: "Requires displayName.",
  }),
  e("activities", {
    id: "set_activity_favorite", title: "Set activity favorite",
    description: "Mark or unmark an activity as favorite.",
    method: "PUT", path: "/activity-service/activity/{activityId}",
    pathParams: ["activityId"], body: "json",
    bodyDescription: "{ activityId, metadataDTO: { favorite } }.", write: true, verified: "yes",
  }),
  e("activities", {
    id: "get_activity_laps", title: "Get activity laps",
    description: "Return lap DTOs for an activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/laps", pathParams: ["activityId"], verified: "yes",
  }),
  e("activities", {
    id: "get_activity_rounds", title: "Get activity rounds",
    description: "Return HIIT, boxing, and similar rounds with exercise sets.",
    method: "GET", path: "/activity-service/activity/{activityId}/rounds", pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("activities", {
    id: "get_activity_step_details", title: "Get workout step details",
    description: "Return structured-workout steps recorded in an activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/stepdetails", pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("activities", {
    id: "get_activity_jump_details", title: "Get activity jump details",
    description: "Return jump-rope and similar jump data.",
    method: "GET", path: "/activity-service/activity/{activityId}/jumpDetails", pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("activities", {
    id: "get_activity_subsecond_details", title: "Get subsecond activity details",
    description: "Return subsecond samples for an activity that supports them.",
    method: "GET", path: "/activity-service/activity/{activityId}/subseconddetails",
    params: { maxChartSize: d("integer", 2000) }, pathParams: ["activityId"], verified: "yes-empty",
    notes: "Only applicable when metadataDTO.hasSubsecondData is true.",
  }),
  e("activities", {
    id: "get_activity_swim_details", title: "Get swim activity details",
    description: "Return charts and polyline data for a pool swim.",
    method: "GET", path: "/activity-service/activity/{activityId}/swimDetails",
    params: { maxChartSize: d("integer", 2000), maxPolylineSize: d("integer", 4000) },
    pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("activities", {
    id: "get_activity_map_details", title: "Get activity map details",
    description: "Return encoded map polyline and heat-map data without charts.",
    method: "GET", path: "/activity-service/activity/{activityId}/mapdetails",
    params: { maxPolylineSize: d("integer", 4000), maxHeatMapSize: d("integer", 4000) },
    pathParams: ["activityId"], verified: "yes",
  }),
  e("activities", {
    id: "get_activity_polyline", title: "Get activity polyline",
    description: "Return the encoded gPolyline track for an activity.",
    method: "GET", path: "/activity-service/activity/polyline/{activityId}", pathParams: ["activityId"], verified: "yes",
  }),
  e("activities", {
    id: "get_activity_power_curve", title: "Get activity power curve",
    description: "Return the best power per duration for one activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/powerCurve", pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("activities", {
    id: "get_adjacent_activities", title: "Get previous activity",
    description: "Return the activity immediately before the specified activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/prev", pathParams: ["activityId"], verified: "yes",
    notes: "Python also calls the .next variant and combines both activityId values.",
  }),
  e("activities", {
    id: "get_adjacent_activities.next", title: "Get next activity",
    description: "Return the activity immediately after the specified activity.",
    method: "GET", path: "/activity-service/activity/{activityId}/next", pathParams: ["activityId"], verified: "yes",
    notes: "Combined with get_adjacent_activities by the Python convenience method.",
  }),
  e("activities", {
    id: "get_activity_event_types", title: "List activity event types",
    description: "Return race, training, recreation, and other event types.",
    method: "GET", path: "/activity-service/activity/eventTypes", verified: "yes",
  }),
  e("activities", {
    id: "get_activity_segments", title: "Get activity segments",
    description: "Return segments matched in an activity.",
    method: "GET", path: "/segment-service/segment/list/{activityId}", pathParams: ["activityId"], verified: "yes-empty",
  }),

  // Personal records, badges, challenges, and goals (achievements.py)
  e("achievements", {
    id: "get_personal_record", title: "Get personal records",
    description: "Return personal records for the authenticated user.",
    method: "GET", path: "/personalrecord-service/personalrecord/prs/{displayName}",
    params: { includeHistory: o("boolean"), months: o("integer") },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("achievements", {
    id: "get_earned_badges", title: "List earned badges",
    description: "Return all badges earned by the user.",
    method: "GET", path: "/badge-service/badge/earned",
  }),
  e("achievements", {
    id: "get_available_badges", title: "List available badges",
    description: "Return badges not yet earned, including exclusive badges.",
    method: "GET", path: "/badge-service/badge/available",
    params: { showExclusiveBadge: d("boolean", true) },
  }),
  e("achievements", {
    id: "get_in_progress_badges", title: "List badges in progress",
    description: "Combine earned and available badges whose progress is incomplete.",
    method: "GET", path: "/badge-service/badge/earned",
    notes: "Composite: also calls get_available_badges and filters/merges both responses by badgeId.",
  }),
  e("achievements", {
    id: "get_adhoc_challenges", title: "List historical ad-hoc challenges",
    description: "Return a page of historical friend challenges.",
    method: "GET", path: "/adhocchallenge-service/adHocChallenge/historical",
    params: { start: r("integer"), limit: r("integer") },
  }),
  e("achievements", {
    id: "get_badge_challenges", title: "List completed badge challenges",
    description: "Return a page of completed badge challenges.",
    method: "GET", path: "/badgechallenge-service/badgeChallenge/completed",
    params: { start: r("integer"), limit: r("integer") },
  }),
  e("achievements", {
    id: "get_available_badge_challenges", title: "List available badge challenges",
    description: "Return a page of badge challenges that can be started.",
    method: "GET", path: "/badgechallenge-service/badgeChallenge/available",
    params: { start: r("integer"), limit: r("integer") },
  }),
  e("achievements", {
    id: "get_non_completed_badge_challenges", title: "List unfinished badge challenges",
    description: "Return a page of started but unfinished badge challenges.",
    method: "GET", path: "/badgechallenge-service/badgeChallenge/non-completed",
    params: { start: r("integer"), limit: r("integer") },
  }),
  e("achievements", {
    id: "get_inprogress_virtual_challenges", title: "List active virtual challenges",
    description: "Return a page of in-progress virtual expeditions.",
    method: "GET", path: "/badgechallenge-service/virtualChallenge/inProgress",
    params: { start: r("integer"), limit: r("integer") },
  }),
  e("achievements", {
    id: "get_goals", title: "List goals",
    description: "Return active, future, or past goals across all pages.",
    method: "GET", path: "/goal-service/goal/goals",
    params: {
      status: d("string", "active"), start: d("integer", 1), limit: d("integer", 30),
      sortOrder: d("string", "asc"),
    },
    notes: "Runtime paginates until empty with a cap and sends Sec-Fetch-Site: same-origin for newer goal types.",
  }),
  e("achievements", {
    id: "get_personal_record_candidates", title: "Get personal record candidates",
    description: "Return personal records awaiting confirmation.",
    method: "GET", path: "/personalrecord-service/personalrecordcandidate/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("achievements", {
    id: "get_personal_record_types", title: "Get personal record types",
    description: "Return personal-record type keys, sports, and bounds.",
    method: "GET", path: "/personalrecord-service/personalrecordtype/prtypes/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("achievements", {
    id: "get_personal_records_for_activity", title: "Get activity personal records",
    description: "Return personal records set by one activity.",
    method: "GET", path: "/personalrecord-service/personalrecord/prByActivityId/{activityId}",
    pathParams: ["activityId"], verified: "yes-empty",
  }),
  e("achievements", {
    id: "get_steps_goal", title: "Get daily step goal",
    description: "Return the device and manual step goals effective for a day.",
    method: "GET", path: "/wellness-service/wellness/wellness-goals/consolidated/steps/{date}",
    pathParams: ["date"], verified: "yes", notes: "Omitted cdate defaults to today in the user's Garmin timezone.",
  }),
  e("achievements", {
    id: "get_effective_goals", title: "Get effective daily goals",
    description: "Return intensity-minute, floor, hydration, and related goals effective for a day.",
    method: "GET", path: "/goal-service/goal/user/effective/{date}",
    pathParams: ["date"], verified: "yes", notes: "Omitted cdate defaults to today in the user's Garmin timezone.",
  }),
  e("achievements", {
    id: "get_user_goals", title: "Get user wellness goals",
    description: "Return stored step, weight, calorie, and related goals.",
    method: "GET", path: "/goal-service/goal/user", verified: "yes",
  }),
  e("achievements", {
    id: "get_weight_goal", title: "Get weight goal history",
    description: "Return weight goals effective over a date range.",
    method: "GET", path: "/goal-service/goal/user/effective/weightgoal/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes-empty",
  }),
  e("achievements", {
    id: "set_daily_goal", title: "Set daily wellness goal",
    description: "Set an intensity-minute, floor, hydration, or weight goal for a day.",
    method: "PUT", path: "/goal-service/goal/user/effective/{goalType}/{date}",
    pathParams: ["goalType", "date"], body: "json",
    bodyDescription: "{ goalValue, goalType } using the original SCREAMING_SNAKE_CASE goal type.",
    write: true, verified: "yes",
    notes: "Runtime dashes/lowercases goalType in the path except WEIGHT_GRAMS. Verified for FLOORS_CLIMBED; date defaults to today.",
  }),
  e("achievements", {
    id: "get_badge_attributes", title: "Get badge attributes",
    description: "Return badge types, categories, and difficulty metadata.",
    method: "GET", path: "/badge-service/badge/attributes", verified: "yes",
  }),
  e("achievements", {
    id: "get_badge_detail", title: "Get badge detail",
    description: "Return details for one badge.",
    method: "GET", path: "/badge-service/badge/detail/v3/{badgeId}", pathParams: ["badgeId"], verified: "yes",
  }),
  e("achievements", {
    id: "get_latest_earned_badges", title: "Get latest earned badges",
    description: "Return the user's most recently earned badges.",
    method: "GET", path: "/badge-service/badge/earned/latest/{displayName}",
    params: { limit: d("integer", 5) }, pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("achievements", {
    id: "get_badges_for_activity", title: "Get activity badges",
    description: "Return badges earned by one activity.",
    method: "GET", path: "/badge-service/badge/{displayName}/earned/activity/{activityId}",
    pathParams: ["displayName", "activityId"], verified: "yes-empty", notes: "Requires displayName.",
  }),
  e("achievements", {
    id: "get_badges_for_day", title: "Get daily badges",
    description: "Return badges earned on a day.",
    method: "GET", path: "/badge-service/badge/{displayName}/earned/dailysummary/{date}",
    pathParams: ["displayName", "date"], verified: "yes-empty",
    notes: "Requires displayName; date defaults to today.",
  }),
  e("achievements", {
    id: "get_available_virtual_challenges", title: "List available virtual challenges",
    description: "Return available virtual expedition challenges.",
    method: "GET", path: "/badgechallenge-service/virtualChallenge/available",
    params: { start: d("integer", 1), limit: d("integer", 100) }, verified: "yes",
  }),
  e("achievements", {
    id: "get_completed_virtual_challenges", title: "List completed virtual challenges",
    description: "Return completed virtual expeditions in descending order.",
    method: "GET", path: "/badgechallenge-service/virtualChallenge/completed",
    params: { desc: d("boolean", true), start: d("integer", 1), limit: d("integer", 100) }, verified: "yes-empty",
  }),
  e("achievements", {
    id: "get_badge_challenge", title: "Get badge challenge",
    description: "Return one badge challenge by UUID.",
    method: "GET", path: "/badgechallenge-service/badgeChallenge/{challengeUuid}",
    pathParams: ["challengeUuid"], verified: "no",
  }),
  e("achievements", {
    id: "get_active_adhoc_challenges", title: "List active ad-hoc challenges",
    description: "Return friend challenges that are still running.",
    method: "GET", path: "/adhocchallenge-service/adHocChallenge/nonCompleted", verified: "yes-empty",
  }),

  // Weight, body composition, and blood pressure (body.py)
  e("body", {
    id: "get_stats_and_body", title: "Get daily stats and body composition",
    description: "Merge a daily summary with average body-composition values.",
    method: "GET", path: "/usersummary-service/usersummary/daily/{displayName}",
    params: { calendarDate: r("date") }, pathParams: ["displayName"],
    notes: "Composite: requires displayName, calls get_stats and get_body_composition, then merges totalAverage.",
  }),
  e("body", {
    id: "get_body_composition", title: "Get body composition",
    description: "Return body-composition samples over a date range.",
    method: "GET", path: "/weight-service/weight/dateRange",
    params: { startDate: r("date"), endDate: d("date", "{startDate}", "Defaults to startDate.") },
  }),
  e("body", {
    id: "add_body_composition", title: "Add body composition",
    description: "Encode and upload a body-composition weigh-in as a FIT activity.",
    method: "POST", path: "/upload-service/upload", body: "multipart",
    bodyDescription: "Multipart field `file` named body_composition.fit with generated FIT bytes.",
    write: true,
    notes: "Requires a FIT encoder and local/UTC timestamp handling; not a plain JSON write.",
  }),
  e("body", {
    id: "add_weigh_in", title: "Add weigh-in",
    description: "Add a manual weight sample with automatically derived local and GMT timestamps.",
    method: "POST", path: "/weight-service/user-weight", body: "json",
    bodyDescription: "{ date, dateTimestamp, gmtTimestamp, unitKey, sourceType: MANUAL, value }.",
    write: true, notes: "Runtime normalizes timestamps in the user's Garmin timezone; unitKey defaults to kg.",
  }),
  e("body", {
    id: "add_weigh_in_with_timestamps", title: "Add timestamped weigh-in",
    description: "Add a manual weight sample with explicit local and optional GMT timestamps.",
    method: "POST", path: "/weight-service/user-weight", body: "json",
    bodyDescription: "{ dateTimestamp, gmtTimestamp, unitKey, sourceType: MANUAL, value }.",
    write: true, notes: "Runtime derives missing timestamps and normalizes them to milliseconds; unitKey defaults to kg.",
  }),
  e("body", {
    id: "get_weigh_ins", title: "Get weigh-ins",
    description: "Return all weigh-ins in a date range.",
    method: "GET", path: "/weight-service/weight/range/{start}/{end}",
    params: { includeAll: d("boolean", true) }, pathParams: ["start", "end"],
  }),
  e("body", {
    id: "get_daily_weigh_ins", title: "Get daily weigh-ins",
    description: "Return all weigh-ins recorded on one day.",
    method: "GET", path: "/weight-service/weight/dayview/{date}",
    params: { includeAll: d("boolean", true) }, pathParams: ["date"],
  }),
  e("body", {
    id: "delete_weigh_in", title: "Delete weigh-in",
    description: "Delete one weight sample by primary key and date.",
    method: "DELETE", path: "/weight-service/weight/{date}/byversion/{weightPk}",
    pathParams: ["date", "weightPk"], write: true, destructive: true,
  }),
  e("body", {
    id: "delete_weigh_ins", title: "Delete daily weigh-ins",
    description: "Delete one or, when explicitly requested, all weigh-ins for a day.",
    method: "DELETE", path: "/weight-service/weight/{date}/byversion/{weightPk}",
    pathParams: ["date", "weightPk"], write: true, destructive: true,
    notes: "Composite: first calls get_daily_weigh_ins; refuses multiple samples unless delete_all=true, then issues one DELETE per sample.",
  }),
  e("body", {
    id: "set_blood_pressure", title: "Add blood pressure",
    description: "Add a manual systolic/diastolic reading with optional pulse and notes.",
    method: "POST", path: "/bloodpressure-service/bloodpressure", body: "json",
    bodyDescription: "{ measurementTimestampLocal, measurementTimestampGMT, systolic, diastolic, sourceType: MANUAL, notes, pulse? }.",
    write: true, notes: "Runtime derives and validates timestamps and measurement ranges.",
  }),
  e("body", {
    id: "update_blood_pressure", title: "Update blood pressure note",
    description: "Change the note on an existing blood-pressure measurement.",
    method: "PUT", path: "/bloodpressure-service/bloodpressure", body: "json",
    bodyDescription: "Complete measurement object with replaced notes.",
    write: true, verified: "yes",
    notes: "Garmin persists only notes on PUT; correcting values requires delete and re-add.",
  }),
  e("body", {
    id: "get_blood_pressure", title: "Get blood pressure range",
    description: "Return blood-pressure measurements grouped by day.",
    method: "GET", path: "/bloodpressure-service/bloodpressure/range/{start}/{end}",
    params: { includeAll: d("boolean", true) }, pathParams: ["start", "end"],
    notes: "Omitted enddate defaults to startdate.",
  }),
  e("body", {
    id: "delete_blood_pressure", title: "Delete blood pressure",
    description: "Delete one blood-pressure measurement by version and date.",
    method: "DELETE", path: "/bloodpressure-service/bloodpressure/{date}/{version}",
    pathParams: ["date", "version"], write: true, destructive: true,
  }),
  e("body", {
    id: "get_latest_weight", title: "Get latest weight",
    description: "Return the most recent weigh-in as of a date.",
    method: "GET", path: "/weight-service/weight/latest",
    params: { date: d("date", "today"), ignorePriority: d("boolean", true) }, verified: "yes",
  }),
  e("body", {
    id: "get_first_weight", title: "Get first weight",
    description: "Return the first weigh-in ever recorded.",
    method: "GET", path: "/weight-service/weight/first", verified: "yes",
  }),
  e("body", {
    id: "get_daily_last_weight", title: "Get last weight per day",
    description: "Return the last weigh-in for each day in a range.",
    method: "GET", path: "/weight-service/weight/daily/last",
    params: { startDate: r("date"), endDate: r("date") }, verified: "yes",
  }),
  e("body", {
    id: "get_weight_snapshot", title: "Get weight range snapshot",
    description: "Return dateWeightList entries for a range.",
    method: "GET", path: "/weight-service/weight/daterangesnapshot",
    params: { startDate: r("date"), endDate: r("date") }, verified: "yes",
  }),
  e("body", {
    id: "get_weekly_weight", title: "Get weekly weight",
    description: "Return exactly 52 weeks of weight aggregates ending at a date.",
    method: "GET", path: "/weight-service/weight/weeklyRange/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
    notes: "Runtime derives start=end-363 days; end defaults to today and Garmin requires this exact range.",
  }),
  e("body", {
    id: "get_blood_pressure_day", title: "Get daily blood pressure",
    description: "Return blood-pressure readings for one day.",
    method: "GET", path: "/bloodpressure-service/bloodpressure/dayview/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today.",
  }),
  e("body", {
    id: "get_daily_last_blood_pressure", title: "Get last blood pressure per day",
    description: "Return the last blood-pressure reading for each day in a range.",
    method: "GET", path: "/bloodpressure-service/bloodpressure/daily/last/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes-empty",
  }),
  e("body", {
    id: "get_weekly_blood_pressure", title: "Get weekly blood pressure",
    description: "Return exactly 52 weeks of blood-pressure aggregates ending at a date.",
    method: "GET", path: "/bloodpressure-service/bloodpressure/weeklyRange/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes-empty",
    notes: "Runtime derives start=end-363 days; end defaults to today and Garmin requires this exact range.",
  }),

  // Performance metrics and biometrics (metrics.py and body.py)
  e("metrics", {
    id: "get_max_metrics", title: "Get daily max metrics",
    description: "Return max metrics for one date using the daily endpoint.",
    method: "GET", path: "/metrics-service/metrics/maxmet/daily/{date}/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_max_metrics_range", title: "Get max metric history",
    description: "Return VO2 max and related max metrics over a range.",
    method: "GET", path: "/metrics-service/metrics/maxmet/{aggregation}/{start}/{end}",
    params: { sport: o("string") }, pathParams: ["aggregation", "start", "end"], verified: "yes",
    notes: "aggregation defaults to daily; weekly and monthly are also accepted.",
  }),
  e("metrics", {
    id: "get_functional_threshold_power_range", title: "Get FTP history",
    description: "Return functional threshold power history for a sport.",
    method: "GET", path: "/biometric-service/stats/functionalThresholdPower/range/{start}/{end}",
    params: {
      sport: d("string", "RUNNING"), aggregation: d("string", "daily"),
      aggregationStrategy: d("string", "LATEST"),
    },
    pathParams: ["start", "end"],
  }),
  e("metrics", {
    id: "get_lactate_threshold", title: "Get latest lactate threshold",
    description: "Return latest running lactate-threshold heart rate and speed.",
    method: "GET", path: "/biometric-service/biometric/latestLactateThreshold",
    notes: "Composite latest mode also calls .latest-power and merges entries; range mode uses the three range variants below.",
  }),
  e("metrics", {
    id: "get_lactate_threshold.latest-power", title: "Get latest lactate power",
    description: "Return the running power component used by latest lactate threshold.",
    method: "GET", path: "/biometric-service/biometric/powerToWeight/latest/{date}",
    params: { sport: d("string", "Running") }, pathParams: ["date"],
    notes: "Date is today in the user's Garmin timezone.",
  }),
  e("metrics", {
    id: "get_lactate_threshold.range-speed", title: "Get lactate threshold speed history",
    description: "Return running lactate-threshold speed over a range.",
    method: "GET", path: "/biometric-service/stats/lactateThresholdSpeed/range/{start}/{end}",
    params: {
      sport: d("string", "RUNNING"), aggregation: d("string", "daily"), aggregationStrategy: d("string", "LATEST"),
    },
    pathParams: ["start", "end"],
  }),
  e("metrics", {
    id: "get_lactate_threshold.range-heart-rate", title: "Get lactate threshold HR history",
    description: "Return running lactate-threshold heart rate over a range.",
    method: "GET", path: "/biometric-service/stats/lactateThresholdHeartRate/range/{start}/{end}",
    params: {
      sport: d("string", "RUNNING"), aggregation: d("string", "daily"), aggregationStrategy: d("string", "LATEST"),
    },
    pathParams: ["start", "end"],
  }),
  e("metrics", {
    id: "get_lactate_threshold.range-power", title: "Get lactate threshold power history",
    description: "Return running FTP/power history used by lactate-threshold range mode.",
    method: "GET", path: "/biometric-service/stats/functionalThresholdPower/range/{start}/{end}",
    params: {
      sport: d("string", "RUNNING"), aggregation: d("string", "daily"), aggregationStrategy: d("string", "LATEST"),
    },
    pathParams: ["start", "end"],
  }),
  e("metrics", {
    id: "get_training_readiness", title: "Get training readiness",
    description: "Return training-readiness snapshots for a date.",
    method: "GET", path: "/metrics-service/metrics/trainingreadiness/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_morning_training_readiness", title: "Get morning training readiness",
    description: "Select the after-wakeup training-readiness snapshot for a date.",
    method: "GET", path: "/metrics-service/metrics/trainingreadiness/{date}", pathParams: ["date"],
    notes: "Client-side filter for inputContext=AFTER_WAKEUP_RESET, with first-entry fallback.",
  }),
  e("metrics", {
    id: "get_training_four_week_load_balance", title: "Get four-week load balance",
    description: "Return training load focus for the trailing four-week period.",
    method: "GET", path: "/metrics-service/metrics/trainingloadbalance/latest/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_daily_training_status", title: "Get daily training status",
    description: "Return training status and acute/chronic load for a day.",
    method: "GET", path: "/metrics-service/metrics/trainingstatus/daily/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_endurance_score", title: "Get daily endurance score",
    description: "Return precise endurance score values for one date.",
    method: "GET", path: "/metrics-service/metrics/endurancescore",
    params: { calendarDate: r("date") }, verified: "yes",
    notes: "When enddate is supplied, Python dispatches to the .range variant instead.",
  }),
  e("metrics", {
    id: "get_endurance_score.range", title: "Get endurance score history",
    description: "Return daily or weekly endurance-score aggregates over a range.",
    method: "GET", path: "/metrics-service/metrics/endurancescore/stats",
    params: { startDate: r("date"), endDate: r("date"), aggregation: d("string", "weekly") }, verified: "yes",
  }),
  e("metrics", {
    id: "get_running_tolerance", title: "Get running tolerance",
    description: "Return daily or weekly running-tolerance data.",
    method: "GET", path: "/metrics-service/metrics/runningtolerance/stats",
    params: { startDate: r("date"), endDate: r("date"), aggregation: d("string", "weekly") },
  }),
  e("metrics", {
    id: "get_race_predictions", title: "Get latest race predictions",
    description: "Return current 5K, 10K, half-marathon, and marathon predictions.",
    method: "GET", path: "/metrics-service/metrics/racepredictions/latest/{displayName}",
    pathParams: ["displayName"], notes: "Requires displayName; supplying dates and type dispatches to .range.",
  }),
  e("metrics", {
    id: "get_race_predictions.range", title: "Get race prediction history",
    description: "Return daily or monthly race predictions over at most one year.",
    method: "GET", path: "/metrics-service/metrics/racepredictions/{aggregation}/{displayName}",
    params: { fromCalendarDate: r("date"), toCalendarDate: r("date") },
    pathParams: ["aggregation", "displayName"], notes: "Requires displayName; aggregation is daily or monthly.",
  }),
  e("metrics", {
    id: "get_training_status", title: "Get aggregated training status",
    description: "Return aggregated training-status data for a date.",
    method: "GET", path: "/metrics-service/metrics/trainingstatus/aggregated/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_fitnessage_data", title: "Get legacy fitness age",
    description: "Return fitness-age data for a date from the legacy endpoint.",
    method: "GET", path: "/fitnessage-service/fitnessage/{date}", pathParams: ["date"],
  }),
  e("metrics", {
    id: "get_hill_score", title: "Get daily hill score",
    description: "Return hill score for one date.",
    method: "GET", path: "/metrics-service/metrics/hillscore",
    params: { calendarDate: r("date") }, verified: "yes",
    notes: "Supplying enddate dispatches to .range; the legacy call remains live but is no longer used by the web app.",
  }),
  e("metrics", {
    id: "get_hill_score.range", title: "Get hill score history",
    description: "Return daily hill-score values over a range.",
    method: "GET", path: "/metrics-service/metrics/hillscore/stats",
    params: { startDate: r("date"), endDate: r("date"), aggregation: d("string", "daily") },
    notes: "The docs verify the legacy single-day get_hill_score call, not this range variant separately.",
  }),
  e("metrics", {
    id: "get_cycling_ftp", title: "Get latest cycling FTP",
    description: "Return the latest cycling functional threshold power.",
    method: "GET", path: "/biometric-service/biometric/latestFunctionalThresholdPower/CYCLING",
  }),
  e("metrics", {
    id: "get_heart_rate_zones", title: "Get legacy heart-rate zones",
    description: "Return configured heart-rate zones for all sport profiles.",
    method: "GET", path: "/biometric-service/heartRateZones",
  }),
  e("metrics", {
    id: "get_power_zones", title: "Get power zones",
    description: "Return configured power zones for all supported sports.",
    method: "GET", path: "/biometric-service/powerZones/sports/all",
  }),
  e("metrics", {
    id: "get_power_zones_for_sport", title: "Get sport power zones",
    description: "Return configured power zones for one sport key.",
    method: "GET", path: "/biometric-service/powerZones/sport/{sport}", pathParams: ["sport"],
  }),
  e("metrics", {
    id: "get_max_metrics_latest", title: "Get latest max metrics",
    description: "Return latest running/generic, cycling, and acclimation max metrics.",
    method: "GET", path: "/metrics-service/metrics/maxmet/latest/{date}",
    pathParams: ["date"], verified: "yes", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_training_readiness_range", title: "Get training readiness history",
    description: "Return all training-readiness snapshots over a range.",
    method: "GET", path: "/metrics-service/metrics/trainingreadiness/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("metrics", {
    id: "get_weekly_training_status", title: "Get weekly training status",
    description: "Return the weekly load and training-status series.",
    method: "GET", path: "/metrics-service/metrics/trainingstatus/weekly/{displayName}",
    params: { fromCalendarDate: r("date"), toCalendarDate: r("date") },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("metrics", {
    id: "get_heat_altitude_acclimation", title: "Get latest acclimation",
    description: "Return latest heat and altitude acclimation.",
    method: "GET", path: "/metrics-service/metrics/heataltitudeacclimation/latest/{date}",
    pathParams: ["date"], verified: "yes", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_heat_altitude_acclimation_range", title: "Get acclimation history",
    description: "Return daily, weekly, or monthly heat/altitude acclimation.",
    method: "GET", path: "/metrics-service/metrics/heataltitudeacclimation/{aggregation}/{start}/{end}",
    pathParams: ["aggregation", "start", "end"], verified: "yes", notes: "aggregation defaults to daily.",
  }),
  e("metrics", {
    id: "get_cycling_ability", title: "Get latest cycling ability",
    description: "Return the latest cycling-ability profile.",
    method: "GET", path: "/metrics-service/metrics/cycling-ability/latest",
    params: { calendarDate: d("date", "today") }, verified: "yes",
  }),
  e("metrics", {
    id: "get_cycling_ability_range", title: "Get cycling ability history",
    description: "Return cyclingAbilitiesMap entries over a range.",
    method: "GET", path: "/metrics-service/metrics/cycling-ability",
    params: { startDate: r("date"), endDate: r("date"), aggregation: d("string", "DAILY") }, verified: "yes",
  }),
  e("metrics", {
    id: "get_running_economy", title: "Get latest running economy",
    description: "Return the latest running-economy score.",
    method: "GET", path: "/metrics-service/metrics/runningeconomy/latest/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today; empty without a capable device.",
  }),
  e("metrics", {
    id: "get_running_economy_range", title: "Get running economy history",
    description: "Return daily or weekly running-economy values.",
    method: "GET", path: "/metrics-service/metrics/runningeconomy/{aggregation}",
    params: { startDate: r("date"), endDate: r("date") },
    pathParams: ["aggregation"], verified: "yes-empty", notes: "aggregation defaults to daily.",
  }),
  e("metrics", {
    id: "get_stamina_curve", title: "Get stamina curve",
    description: "Return the latest running or cycling stamina curve.",
    method: "GET", path: "/metrics-service/metrics/stamina-curve/latest",
    params: { calendarDate: d("date", "today"), sportType: d("string", "running") }, verified: "yes-empty",
  }),
  e("metrics", {
    id: "update_heart_rate_zones", title: "Update heart-rate zones",
    description: "Write per-sport heart-rate zone objects.",
    method: "PUT", path: "/biometric-service/heartRateZones/", body: "json",
    bodyDescription: "Non-empty list of get_heart_rate_zones_v2-shaped sport zone objects.",
    write: true, verified: "yes", notes: "Reference verification sent an unchanged object.",
  }),
  e("metrics", {
    id: "update_power_zones", title: "Update power zones",
    description: "Write per-sport power-zone objects.",
    method: "PUT", path: "/biometric-service/powerZones/all", body: "json",
    bodyDescription: "Non-empty list of get_power_zones-shaped sport zone objects.",
    write: true, verified: "yes", notes: "Reference verification sent an unchanged object.",
  }),
  e("metrics", {
    id: "get_heart_rate_zones_v2", title: "Get heart-rate zones v2",
    description: "Return web-app heart-rate zones, optionally generating defaults.",
    method: "GET", path: "/biometric-service/heartRateZones/v2",
    params: { generateDefaults: d("boolean", false) }, verified: "yes",
  }),
  e("metrics", {
    id: "get_biometric_stats", title: "Get biometric statistics",
    description: "Return aggregated weight, body-fat, lactate-threshold, and FTP statistics.",
    method: "GET", path: "/biometric-service/stats",
    params: {
      aggregation: d("string", "daily"), userFirstDay: d("string", "monday"),
      startDate: r("date"), endDate: r("date"),
    },
    verified: "yes",
  }),
  e("metrics", {
    id: "get_power_to_weight_range", title: "Get power-to-weight history",
    description: "Return power-to-weight history with one series per sport.",
    method: "GET", path: "/biometric-service/stats/powerToWeight/range/{start}/{end}",
    params: { aggregation: d("string", "daily"), sport: o("string") },
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("metrics", {
    id: "get_critical_swim_speed", title: "Get latest critical swim speed",
    description: "Return the latest critical-swim-speed value.",
    method: "GET", path: "/biometric-service/criticalSwimSpeed/latest/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_critical_swim_speed_range", title: "Get critical swim speed history",
    description: "Return critical-swim-speed values over a range.",
    method: "GET", path: "/biometric-service/criticalSwimSpeed/range/{start}/{end}",
    params: { aggregation: o("string") }, pathParams: ["start", "end"], verified: "yes-empty",
  }),
  e("metrics", {
    id: "get_glucose_data", title: "Get daily glucose",
    description: "Return glucoseList readings for one day.",
    method: "GET", path: "/biometric-service/biometric/glucose/{date}", pathParams: ["date"], verified: "yes-empty",
  }),
  e("metrics", {
    id: "get_glucose_data_range", title: "Get glucose history",
    description: "Return glucose readings over a range.",
    method: "GET", path: "/biometric-service/biometric/glucose/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes-empty",
  }),
  e("metrics", {
    id: "get_current_biometrics", title: "Get current biometrics",
    description: "Return height, weight, VO2 max, lactate threshold, and FTP.",
    method: "GET", path: "/userprofile-service/biometric/current/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("metrics", {
    id: "get_power_curve", title: "Get power curve",
    description: "Return best power per duration for a sport and range.",
    method: "GET", path: "/fitnessstats-service/powerCurve",
    params: { startDate: r("date"), endDate: r("date"), sport: d("string", "cycling") }, verified: "yes-empty",
  }),
  e("metrics", {
    id: "get_one_rep_max", title: "Get current one-rep maxima",
    description: "Return current estimated one-rep-max values for all exercises.",
    method: "GET", path: "/fitnessstats-service/vbt-stats/one-rep-max/current/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today; exercise_type dispatches to .exercise.",
  }),
  e("metrics", {
    id: "get_one_rep_max.exercise", title: "Get exercise one-rep max",
    description: "Return the current estimated one-rep max for one exercise.",
    method: "GET", path: "/fitnessstats-service/vbt-stats/one-rep-max/{exerciseType}/current/{date}",
    pathParams: ["exerciseType", "date"], verified: "yes-empty", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_one_rep_max_history", title: "Get one-rep max history",
    description: "Return daily or monthly estimated one-rep-max history for an exercise.",
    method: "GET", path: "/fitnessstats-service/vbt-stats/one-rep-max/{exerciseType}/{aggregation}",
    params: { startDate: r("date"), endDate: r("date") },
    pathParams: ["exerciseType", "aggregation"], verified: "no", notes: "aggregation defaults to daily.",
  }),
  e("metrics", {
    id: "get_fitness_age_details", title: "Get fitness age details",
    description: "Return fitness age, its components, and achievable targets.",
    method: "GET", path: "/fitnessage-service/fitnessage/v2/{date}",
    pathParams: ["date"], verified: "yes", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_fitness_age_daily", title: "Get daily fitness age",
    description: "Return daily fitness-age history and related components.",
    method: "GET", path: "/fitnessage-service/stats/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("metrics", {
    id: "get_fitness_age_weekly", title: "Get weekly fitness age",
    description: "Return weekly fitness-age history ending at a date.",
    method: "GET", path: "/fitnessage-service/stats/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("metrics", {
    id: "get_spo2_acclimation_data", title: "Get SpO2 acclimation",
    description: "Return daily pulse-ox readings together with acclimation values.",
    method: "GET", path: "/wellness-service/wellness/daily/spo2acclimation/{date}",
    pathParams: ["date"], verified: "yes", notes: "Date defaults to today.",
  }),
  e("metrics", {
    id: "get_acclimation_stats", title: "Get acclimation statistics",
    description: "Return SpO2 acclimation statistics over a range.",
    method: "GET", path: "/wellness-service/stats/daily/acclimation",
    params: { fromDate: r("date"), untilDate: r("date") }, verified: "yes",
  }),

  // Daily health and wellness (health.py)
  e("health", {
    id: "get_stats", title: "Get daily stats",
    description: "Return the daily user summary; an alias of get_user_summary.",
    method: "GET", path: "/usersummary-service/usersummary/daily/{displayName}",
    params: { calendarDate: r("date") }, pathParams: ["displayName"], notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_user_summary", title: "Get daily user summary",
    description: "Return the user's activity and wellness summary for a date.",
    method: "GET", path: "/usersummary-service/usersummary/daily/{displayName}",
    params: { calendarDate: r("date") }, pathParams: ["displayName"], notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_steps_data", title: "Get intraday steps",
    description: "Return the daily summary chart containing intraday steps.",
    method: "GET", path: "/wellness-service/wellness/dailySummaryChart/{displayName}",
    params: { date: r("date") }, pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_floors", title: "Get intraday floors",
    description: "Return daily floor-chart data.",
    method: "GET", path: "/wellness-service/wellness/floorsChartData/daily/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_daily_steps", title: "Get daily steps",
    description: "Return daily step totals over a range using the legacy endpoint.",
    method: "GET", path: "/usersummary-service/stats/steps/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
    notes: "Runtime splits ranges longer than 28 days and merges the responses.",
  }),
  e("health", {
    id: "get_weekly_steps", title: "Get weekly steps",
    description: "Return weekly step and distance aggregates.",
    method: "GET", path: "/usersummary-service/stats/steps/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], notes: "weeks defaults to 52.",
  }),
  e("health", {
    id: "get_weekly_stress", title: "Get weekly stress",
    description: "Return weekly overall stress aggregates.",
    method: "GET", path: "/usersummary-service/stats/stress/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], notes: "weeks defaults to 52.",
  }),
  e("health", {
    id: "get_weekly_intensity_minutes", title: "Get weekly intensity minutes",
    description: "Return weekly moderate/vigorous minutes and weekly goals.",
    method: "GET", path: "/usersummary-service/stats/im/weekly/{start}/{end}", pathParams: ["start", "end"],
  }),
  e("health", {
    id: "get_heart_rates", title: "Get daily heart rates",
    description: "Return intraday heart-rate data for a date.",
    method: "GET", path: "/wellness-service/wellness/dailyHeartRate/{displayName}",
    params: { date: r("date") }, pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_body_battery", title: "Get Body Battery",
    description: "Return daily Body Battery values over a range.",
    method: "GET", path: "/wellness-service/wellness/bodyBattery/reports/daily",
    params: { startDate: r("date"), endDate: d("date", "{startDate}", "Defaults to startDate.") },
  }),
  e("health", {
    id: "get_body_battery_events", title: "Get Body Battery events",
    description: "Return sleep, activity, auto-detection, and nap events affecting Body Battery.",
    method: "GET", path: "/wellness-service/wellness/bodyBattery/events/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "add_hydration_data", title: "Log hydration",
    description: "Add or subtract a hydration amount in milliliters.",
    method: "PUT", path: "/usersummary-service/usersummary/hydration/log", body: "json",
    bodyDescription: "{ calendarDate, timestampLocal, valueInML, userProfileId? }.",
    write: true,
    notes: "Runtime derives consistent local date/timestamp values and includes profileId when known.",
  }),
  e("health", {
    id: "get_hydration_data", title: "Get daily hydration",
    description: "Return the lightweight hydration record for a date.",
    method: "GET", path: "/usersummary-service/usersummary/hydration/daily/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_respiration_data", title: "Get daily respiration",
    description: "Return respiration data for a date.",
    method: "GET", path: "/wellness-service/wellness/daily/respiration/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_spo2_data", title: "Get daily SpO2",
    description: "Return pulse-ox data for a date from the legacy endpoint.",
    method: "GET", path: "/wellness-service/wellness/daily/spo2/{date}", pathParams: ["date"], verified: "yes",
    notes: "Python normalizes a string lastSevenDaysAvgSpO2 value to a float.",
  }),
  e("health", {
    id: "get_intensity_minutes_data", title: "Get daily intensity minutes",
    description: "Return intensity-minute data for a date.",
    method: "GET", path: "/wellness-service/wellness/daily/im/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_all_day_stress", title: "Get all-day stress",
    description: "Return all-day stress data for a date.",
    method: "GET", path: "/wellness-service/wellness/dailyStress/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_all_day_events", title: "Get all-day events",
    description: "Return daily events, including auto-detected activities.",
    method: "GET", path: "/wellness-service/wellness/dailyEvents",
    params: { calendarDate: r("date") }, verified: "yes",
  }),
  e("health", {
    id: "get_sleep_data", title: "Get legacy sleep data",
    description: "Return sleep data from the wellness-service endpoint.",
    method: "GET", path: "/wellness-service/wellness/dailySleepData/{displayName}",
    params: { date: r("date"), nonSleepBufferMinutes: d("integer", 60) },
    pathParams: ["displayName"], verified: "yes",
    notes: "Requires displayName. Prefer GMT timestamps if local timestamps appear shifted.",
  }),
  e("health", {
    id: "get_sleep_daily", title: "Get daily sleep history",
    description: "Return individual daily sleep-stat rows over a range.",
    method: "GET", path: "/sleep-service/stats/sleep/daily/{start}/{end}",
    pathParams: ["start", "end"],
    notes: "Runtime splits ranges into 28-day chunks, de-duplicates by calendarDate, and sorts results.",
  }),
  e("health", {
    id: "get_stress_data", title: "Get stress data",
    description: "Return stress data for a date.",
    method: "GET", path: "/wellness-service/wellness/dailyStress/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_lifestyle_logging_data", title: "Get lifestyle logging",
    description: "Return lifestyle-logging data for a date.",
    method: "GET", path: "/lifestylelogging-service/dailyLog/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_rhr_day", title: "Get daily resting heart rate",
    description: "Return resting-heart-rate metric 60 for one date.",
    method: "GET", path: "/userstats-service/wellness/daily/{displayName}",
    params: { fromDate: r("date"), untilDate: r("date"), metricId: d("integer", 60) },
    pathParams: ["displayName"], notes: "Requires displayName; fromDate and untilDate are the same value.",
  }),
  e("health", {
    id: "get_rhr_daily", title: "Get resting heart rate history",
    description: "Return non-null daily resting-heart-rate values over a range.",
    method: "GET", path: "/userstats-service/wellness/daily/{displayName}",
    params: { fromDate: r("date"), untilDate: r("date"), metricId: d("integer", 60) },
    pathParams: ["displayName"], notes: "Requires displayName; Python flattens metricsMap and drops null values.",
  }),
  e("health", {
    id: "get_calories_daily", title: "Get daily calorie history",
    description: "Return active, resting, and total calories per day.",
    method: "GET", path: "/userstats-service/wellness/daily/{displayName}",
    params: { fromDate: r("date"), untilDate: r("date"), metricId: d("integer[]", [22, 23]) },
    pathParams: ["displayName"], notes: "Requires displayName; Python merges active and BMR series by date.",
  }),
  e("health", {
    id: "get_hrv_data", title: "Get daily HRV",
    description: "Return heart-rate-variability data for a date.",
    method: "GET", path: "/hrv-service/hrv/{date}", pathParams: ["date"],
  }),
  e("health", {
    id: "get_hrv_data_range", title: "Get HRV history",
    description: "Return heart-rate-variability data over a range.",
    method: "GET", path: "/hrv-service/hrv/daily/{start}/{end}", pathParams: ["start", "end"],
  }),
  e("health", {
    id: "download_health_snapshot", title: "Download daily Health Snapshot",
    description: "Download all Health Snapshot data for one day as a ZIP archive.",
    method: "GET", path: "/download-service/files/wellness/{date}",
    pathParams: ["date"], body: "download", bodyDescription: "ZIP bytes.", download: true,
  }),
  e("health", {
    id: "get_jetlag_trips", title: "List jet lag trips",
    description: "Return all Jet Lag Adviser trips and their flights.",
    method: "GET", path: "/jetlag-service/jetlag/trip/all",
  }),
  e("health", {
    id: "add_jetlag_trip", title: "Add jet lag trip",
    description: "Create a Jet Lag Adviser trip and its flight legs.",
    method: "POST", path: "/jetlag-service/jetlag/trip", body: "json",
    bodyDescription: "{ startDate, endDate, flights, userId? }; each flight has origin/destination location, timezone, and timestamp fields.",
    write: true, notes: "Runtime validates flight timestamps and UTC offsets and includes profileId when known.",
  }),
  e("health", {
    id: "update_jetlag_trip", title: "Replace jet lag trip",
    description: "Replace a complete Jet Lag Adviser trip and all its flights.",
    method: "PUT", path: "/jetlag-service/jetlag/trip", body: "json",
    bodyDescription: "Complete add_jetlag_trip body plus tripId on the trip and every flight.",
    write: true, destructive: true,
    notes: "Full replacement; retain flightId values for existing legs.",
  }),
  e("health", {
    id: "delete_jetlag_trip", title: "Delete jet lag trip",
    description: "Delete a Jet Lag Adviser trip.",
    method: "DELETE", path: "/jetlag-service/jetlag/trip/{tripId}",
    pathParams: ["tripId"], write: true, destructive: true,
  }),
  e("health", {
    id: "get_daily_stats", title: "Get daily wellness statistics",
    description: "Return daily steps, pushes, or calories with aggregations.",
    method: "GET", path: "/usersummary-service/stats/daily/{start}/{end}",
    params: { statsType: d("string", "STEPS"), currentDate: d("date", "today") },
    pathParams: ["start", "end"], verified: "yes", notes: "aggregated=true dispatches to .aggregated.",
  }),
  e("health", {
    id: "get_daily_stats.aggregated", title: "Get aggregated daily wellness statistics",
    description: "Return the aggregated variant of the daily steps, pushes, or calories report.",
    method: "GET", path: "/usersummary-service/stats/daily/aggregated/{start}/{end}",
    params: { statsType: d("string", "STEPS"), currentDate: d("date", "today") },
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_daily_heart_rate_stats", title: "Get daily heart-rate statistics",
    description: "Return resting, minimum, and maximum heart rate per day.",
    method: "GET", path: "/usersummary-service/stats/heartRate/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_weekly_heart_rate_stats", title: "Get weekly heart-rate statistics",
    description: "Return weekly heart-rate averages and abnormal-alert counts.",
    method: "GET", path: "/usersummary-service/stats/heartRate/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("health", {
    id: "get_daily_stress_stats", title: "Get daily stress statistics",
    description: "Return overall stress and stress-duration values per day.",
    method: "GET", path: "/usersummary-service/stats/stress/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_daily_body_battery_stats", title: "Get daily Body Battery statistics",
    description: "Return daily Body Battery low and high values.",
    method: "GET", path: "/usersummary-service/stats/bodybattery/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_daily_intensity_minutes_stats", title: "Get daily intensity statistics",
    description: "Return daily moderate/vigorous minutes and the weekly goal.",
    method: "GET", path: "/usersummary-service/stats/im/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_daily_respiration_stats", title: "Get daily respiration statistics",
    description: "Return average waking and sleeping respiration per day.",
    method: "GET", path: "/usersummary-service/stats/respiration/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_daily_floors_stats", title: "Get daily floor statistics",
    description: "Return floors ascended/descended and the daily goal.",
    method: "GET", path: "/usersummary-service/stats/floors/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_weekly_floors_stats", title: "Get weekly floor statistics",
    description: "Return weekly floor totals.",
    method: "GET", path: "/usersummary-service/stats/floors/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("health", {
    id: "get_daily_hydration_stats", title: "Get daily hydration statistics",
    description: "Return hydration intake per day.",
    method: "GET", path: "/usersummary-service/stats/hydration/daily/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes-empty",
  }),
  e("health", {
    id: "get_weekly_hydration_stats", title: "Get weekly hydration statistics",
    description: "Return weekly hydration totals.",
    method: "GET", path: "/usersummary-service/stats/hydration/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes-empty", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("health", {
    id: "get_weekly_calories_stats", title: "Get weekly calorie statistics",
    description: "Return weekly resting, active, and total calories.",
    method: "GET", path: "/usersummary-service/stats/calories/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("health", {
    id: "get_monthly_steps", title: "Get monthly steps",
    description: "Return monthly step totals ending at a date.",
    method: "GET", path: "/usersummary-service/stats/steps/monthly/{end}/{months}",
    pathParams: ["end", "months"], verified: "yes", notes: "end defaults to today; months defaults to 12.",
  }),
  e("health", {
    id: "get_stats_averages", title: "Get wellness averages",
    description: "Return average steps and resting heart rate over a range.",
    method: "GET", path: "/usersummary-service/stats/averages/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_lifetime_totals", title: "Get lifetime totals",
    description: "Return lifetime distance, steps, calories, and active-day totals.",
    method: "GET", path: "/usersummary-service/stats/connectLifetimeTotals/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_daily_summaries", title: "Get daily summaries",
    description: "Return full daily user summaries for a range in one request.",
    method: "GET", path: "/usersummary-service/v2/dailysummaries",
    params: { startDate: r("date"), endDate: r("date") }, verified: "yes",
  }),
  e("health", {
    id: "get_week_average_resting_hr", title: "Get weekly average resting HR",
    description: "Return the seven-day average resting heart rate as of a date.",
    method: "GET", path: "/usersummary-service/usersummary/weekAverageRestingHR/{displayName}",
    params: { calendarDate: d("date", "today") }, pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_hydration_all_data", title: "Get complete hydration data",
    description: "Return hydration intake, goal, sweat loss, and container settings.",
    method: "GET", path: "/usersummary-service/usersummary/hydration/allData/{date}",
    pathParams: ["date"], verified: "yes", notes: "Date defaults to today.",
  }),
  e("health", {
    id: "get_daily_movement", title: "Get daily movement",
    description: "Return movement in 15-minute blocks for a day.",
    method: "GET", path: "/wellness-service/wellness/dailyMovement",
    params: { calendarDate: d("date", "today") }, verified: "yes",
  }),
  e("health", {
    id: "set_steps_goal", title: "Set daily step goal",
    description: "Set a manual step goal or restore the device's automatic goal.",
    method: "PUT", path: "/wellness-service/wellness/wellness-goals/consolidated/steps/{date}",
    pathParams: ["date"], body: "json",
    bodyDescription: "Current goal object with userGoal and userGoalCategory changed to manual or my-auto.",
    write: true, verified: "yes",
    notes: "Runtime GETs the current goal first. A positive value is manual; null/0 restores automatic. Date defaults to today.",
  }),
  e("health", {
    id: "get_sync_timestamp", title: "Get last sync timestamp",
    description: "Return the UTC timestamp of the last device sync.",
    method: "GET", path: "/wellness-service/wellness/syncTimestamp", verified: "yes",
  }),
  e("health", {
    id: "get_hourly_intensity_minutes", title: "Get hourly intensity minutes",
    description: "Return hourly intensity minutes for up to seven days.",
    method: "GET", path: "/wellness-service/stats/hourly/im/{end}/{days}",
    pathParams: ["end", "days"], verified: "yes",
    notes: "end defaults to today; days defaults to 7 and must be 1-7 inside the current week.",
  }),
  e("health", {
    id: "get_weekly_wellness_stats", title: "Get weekly wellness metrics",
    description: "Return weekly wellness metric series, defaulting to resting heart rate.",
    method: "GET", path: "/userstats-service/wellness/weekly/{displayName}",
    params: {
      fromWeekStartDate: r("date"), untilWeekStartDate: r("date"),
      metricId: d("integer[]", [60]), grpParentActType: d("boolean", false),
    },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName; dates should be week starts.",
  }),
  e("health", {
    id: "get_monthly_wellness_stats", title: "Get monthly wellness metrics",
    description: "Return monthly wellness metric series, defaulting to resting heart rate.",
    method: "GET", path: "/userstats-service/wellness/monthly/{displayName}",
    params: {
      fromMonthStartDate: r("date"), untilMonthStartDate: r("date"),
      metricId: d("integer[]", [60]), grpParentActType: d("boolean", false),
    },
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName; dates should be month starts.",
  }),
  e("health", {
    id: "get_user_statistics", title: "Get user activity statistics",
    description: "Return totals per activity type for the user.",
    method: "GET", path: "/userstats-service/statistics/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("health", {
    id: "get_daily_sleep", title: "Get daily sleep",
    description: "Return sleep data from the current sleep-service endpoint.",
    method: "GET", path: "/sleep-service/sleep/dailySleepData",
    params: { date: d("date", "today"), nonSleepBufferMinutes: d("integer", 60) }, verified: "yes",
    notes: "Passing null for nonSleepBufferMinutes omits that query parameter.",
  }),
  e("health", {
    id: "get_naps", title: "Get naps",
    description: "Return naps recorded on a day.",
    method: "GET", path: "/sleep-service/sleep/naps/{date}",
    params: { includeOverlaps: d("boolean", true) }, pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today.",
  }),
  e("health", {
    id: "get_sleep_stats_weekly", title: "Get weekly sleep statistics",
    description: "Return overall and per-week sleep statistics.",
    method: "GET", path: "/sleep-service/stats/sleep/weekly/{end}/{weeks}",
    pathParams: ["end", "weeks"], verified: "yes", notes: "end defaults to today; weeks defaults to 52.",
  }),
  e("health", {
    id: "get_sleep_stats_overall", title: "Get overall sleep statistics",
    description: "Return average sleep statistics over a range.",
    method: "GET", path: "/sleep-service/stats/sleep/overall/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_health_snapshots", title: "List daily Health Snapshots",
    description: "Return Health Snapshot sessions recorded on a day.",
    method: "GET", path: "/wellnessactivity-service/activity/summary/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today.",
  }),
  e("health", {
    id: "get_health_snapshots_range", title: "List Health Snapshots by range",
    description: "Return Health Snapshot sessions over a range.",
    method: "GET", path: "/wellnessactivity-service/activity/summary/range/{start}/{end}",
    pathParams: ["start", "end"], verified: "yes",
  }),
  e("health", {
    id: "get_health_snapshot", title: "Get Health Snapshot",
    description: "Return one Health Snapshot session summary.",
    method: "GET", path: "/wellnessactivity-service/activity/summary/{date}/{snapshotUuid}",
    pathParams: ["date", "snapshotUuid"], verified: "yes",
  }),
  e("health", {
    id: "get_health_snapshot_epochs", title: "Get Health Snapshot epochs",
    description: "Return per-epoch HR, HRV, SpO2, respiration, and stress samples.",
    method: "GET", path: "/wellnessactivity-service/activity/epoch/{snapshotUuid}",
    pathParams: ["snapshotUuid"], verified: "yes",
  }),
  e("health", {
    id: "download_health_snapshot_session", title: "Download Health Snapshot session",
    description: "Download one Health Snapshot session as FIT bytes.",
    method: "GET", path: "/download-service/files/wellness/activity/{date}/{snapshotUuid}",
    pathParams: ["date", "snapshotUuid"], body: "download", bodyDescription: "FIT bytes.", download: true, verified: "yes",
  }),
  e("health", {
    id: "get_ecg_daily", title: "Get daily ECG recordings",
    description: "Return ECG recordings grouped by day over a range.",
    method: "GET", path: "https://ghs.{domain}/ghs/ecg/v1/ecg/daily",
    params: { firstDay: r("date"), lastDay: r("date") }, pathParams: ["domain"], verified: "yes",
    notes: "Absolute sibling-host URL; domain is selected from Region. Accounts without ECG receive 404.",
  }),
  e("health", {
    id: "get_ecg_list", title: "List ECG recordings",
    description: "Return a page of ECG recordings and detail identifiers.",
    method: "GET", path: "https://ghs.{domain}/ghs/ecg/v1/ecg/list",
    params: {
      firstDay: d("date", "2021-01-01"), lastDay: d("date", "today"),
      pageSize: d("integer", 20), page: o("string"),
    },
    pathParams: ["domain"], verified: "yes",
    notes: "Absolute sibling-host URL; page is an optional continuation token.",
  }),
  e("health", {
    id: "get_ecg", title: "Get ECG waveform",
    description: "Return one ECG recording and its waveform.",
    method: "GET", path: "https://ghs.{domain}/ghs/ecg/v1/ecg/{ecgId}",
    pathParams: ["domain", "ecgId"], verified: "no", notes: "Absolute sibling-host URL; domain is selected from Region.",
  }),
  e("health", {
    id: "get_jetlag_status", title: "Get daily jet lag guidance",
    description: "Return Jet Lag Adviser guidance for a day.",
    method: "GET", path: "/jetlag-service/jetlag/status/daily/{date}",
    pathParams: ["date"], verified: "yes-empty", notes: "Date defaults to today; empty without a trip.",
  }),

  // Nutrition (health.py)
  e("nutrition", {
    id: "get_nutrition_status", title: "Get nutrition tracking status",
    description: "Return whether nutrition tracking or MyFitnessPal is in use.",
    method: "GET", path: "/nutrition-service/user/nutritionCurrentStatus", verified: "yes",
  }),
  e("nutrition", {
    id: "get_calorie_summary", title: "Get calorie summary",
    description: "Return per-meal nutrition totals and goals over a range.",
    method: "GET", path: "/nutrition-service/calorie/summary/daily",
    params: {
      startDate: r("date"), endDate: r("date"), currentDate: d("date", "today"),
      isDataForReport: d("boolean", true),
    },
    verified: "yes",
  }),
  e("nutrition", {
    id: "get_nutrition_daily_food_log", title: "Get daily food log",
    description: "Return food-log entries with nutrition totals and goals.",
    method: "GET", path: "/nutrition-service/food/logs/{date}",
    params: {
      includeGoals: d("boolean", true), includeNutrition: d("boolean", true), mealId: o("integer"),
    },
    pathParams: ["date"], verified: "yes",
  }),
  e("nutrition", {
    id: "get_nutrition_daily_meals", title: "Get daily meals",
    description: "Return the meal summary for a date.",
    method: "GET", path: "/nutrition-service/meals/{date}", pathParams: ["date"],
  }),
  e("nutrition", {
    id: "get_nutrition_daily_settings", title: "Get nutrition settings",
    description: "Return nutrition settings for a date.",
    method: "GET", path: "/nutrition-service/settings/{date}", pathParams: ["date"],
  }),

  // Gear and activity links (gear.py)
  e("gear", {
    id: "get_gear", title: "Get legacy gear",
    description: "Return legacy gear records for a user profile number.",
    method: "GET", path: "/gear-service/gear/filterGear",
    params: { userProfilePk: r("string") }, verified: "yes",
    notes: "Legacy undashed UUIDs differ from v2 dashed UUIDs; notes are absent from these records.",
  }),
  e("gear", {
    id: "create_gear", title: "Create gear",
    description: "Create gear with usage thresholds and optional activity-type associations.",
    method: "POST", path: "/gear-service/gear/v2", body: "json",
    bodyDescription: "Complete v2 gear object with null uuid/maxUsageDate and converted threshold units.",
    write: true,
    notes: "Runtime converts km to integer meters and minutes to integer seconds. Only SHOES/DISTANCE was confirmed in source comments.",
  }),
  e("gear", {
    id: "get_gear_stats", title: "Get legacy gear stats",
    description: "Return usage statistics for a legacy gear UUID.",
    method: "GET", path: "/gear-service/gear/stats/{gearUuid}",
    pathParams: ["gearUuid"], verified: "yes", notes: "Python maps a 404 to an empty object.",
  }),
  e("gear", {
    id: "get_gear_defaults", title: "Get legacy default gear",
    description: "Return default gear per activity type for a profile number.",
    method: "GET", path: "/gear-service/gear/user/{userProfileNumber}/activityTypes",
    pathParams: ["userProfileNumber"], verified: "yes",
  }),
  e("gear", {
    id: "set_gear_default", title: "Set legacy default gear",
    description: "Make legacy gear the default for an activity type.",
    method: "PUT", path: "/gear-service/gear/{gearUuid}/activityType/{activityType}/default/true",
    pathParams: ["gearUuid", "activityType"], write: true, verified: "yes",
    notes: "Uses legacy undashed UUIDs. defaultGear=false dispatches to .remove.",
  }),
  e("gear", {
    id: "set_gear_default.remove", title: "Remove legacy default gear",
    description: "Remove legacy gear as the default for an activity type.",
    method: "DELETE", path: "/gear-service/gear/{gearUuid}/activityType/{activityType}",
    pathParams: ["gearUuid", "activityType"], write: true, destructive: true, verified: "yes",
  }),
  e("gear", {
    id: "get_activity_gear", title: "Get legacy activity gear",
    description: "Return gear linked to an activity through the legacy endpoint.",
    method: "GET", path: "/gear-service/gear/filterGear", params: { activityId: r("string") },
  }),
  e("gear", {
    id: "get_gear_activities", title: "Get gear activities",
    description: "Return activities in which a piece of gear was used.",
    method: "GET", path: "/activitylist-service/activities/{gearUuid}/gear",
    params: { start: d("integer", 0), limit: d("integer", 1000) },
    pathParams: ["gearUuid"], verified: "yes", notes: "Python maps a 404 to an empty list and caps limit.",
  }),
  e("gear", {
    id: "add_gear_to_activity", title: "Link gear to activity",
    description: "Associate a gear UUID with an activity.",
    method: "PUT", path: "/gear-service/gear/link/{gearUuid}/activity/{activityId}",
    pathParams: ["gearUuid", "activityId"], write: true,
  }),
  e("gear", {
    id: "remove_gear_from_activity", title: "Unlink gear from activity",
    description: "Remove the association between gear and an activity.",
    method: "PUT", path: "/gear-service/gear/unlink/{gearUuid}/activity/{activityId}",
    pathParams: ["gearUuid", "activityId"], write: true, destructive: true,
  }),
  e("gear", {
    id: "get_gear_list", title: "List gear v2",
    description: "Return a page of v2 gear records with dashed UUIDs.",
    method: "GET", path: "/gear-service/gear/v2/list",
    params: {
      start: d("integer", 0), limit: d("integer", 20), gearStatuses: o("string[]"),
      gearType: o("string"), sortOrder: o("string"),
    },
    verified: "yes",
  }),
  e("gear", {
    id: "get_gear_details", title: "Get gear v2",
    description: "Return one complete v2 gear object.",
    method: "GET", path: "/gear-service/gear/v2/{gearUuid}", pathParams: ["gearUuid"], verified: "yes",
  }),
  e("gear", {
    id: "set_gear_status", title: "Set gear status",
    description: "Retire or reactivate a v2 gear item.",
    method: "PUT", path: "/gear-service/gear/v2/{gearUuid}/status/{status}",
    pathParams: ["gearUuid", "status"], write: true, verified: "no", notes: "status is ACTIVE or RETIRED; no request body.",
  }),
  e("gear", {
    id: "update_gear", title: "Update gear",
    description: "Edit a v2 gear item using the required complete-object representation.",
    method: "PUT", path: "/gear-service/gear/v2/{gearUuid}",
    pathParams: ["gearUuid"], body: "json",
    bodyDescription: "Complete gear object from get_gear_details with editable fields changed.",
    write: true, verified: "yes",
    notes: "Runtime GETs first, converts threshold units/activity associations, PUTs, then GETs the updated object; partial bodies fail.",
  }),
  e("gear", {
    id: "delete_gear", title: "Delete gear",
    description: "Permanently delete a v2 gear item.",
    method: "DELETE", path: "/gear-service/gear/v2/{gearUuid}",
    pathParams: ["gearUuid"], write: true, destructive: true, verified: "yes",
  }),
  e("gear", {
    id: "get_gear_types", title: "List gear types",
    description: "Return all gear types known to Garmin.",
    method: "GET", path: "/gear-service/gear/types", verified: "yes",
  }),
  e("gear", {
    id: "get_user_gear_types", title: "List user's gear types",
    description: "Return active gear types present in the user's gear collection.",
    method: "GET", path: "/gear-service/gear/v2/user-gear-types", verified: "yes",
  }),
  e("gear", {
    id: "get_gear_make_models", title: "Search gear makes and models",
    description: "Search the gear make/model autocomplete catalogue.",
    method: "GET", path: "/gear-service/gear/makemodels",
    params: { keywords: r("string") }, verified: "yes",
  }),
  e("gear", {
    id: "get_activity_gear_v2", title: "Get activity gear v2",
    description: "Return v2 gear records linked to an activity.",
    method: "GET", path: "/gear-service/activity/v2/{activityId}",
    pathParams: ["activityId"], verified: "yes-empty",
  }),

  // Devices, sensors, and device messages (devices.py)
  e("devices", {
    id: "get_devices", title: "List registered devices",
    description: "Return devices available to the current account.",
    method: "GET", path: "/device-service/deviceregistration/devices",
  }),
  e("devices", {
    id: "get_device_settings", title: "Get device settings",
    description: "Return settings for one device.",
    method: "GET", path: "/device-service/deviceservice/device-info/settings/{deviceId}", pathParams: ["deviceId"],
  }),
  e("devices", {
    id: "get_primary_training_device", title: "Get primary training device",
    description: "Return the primary device and priority order of all devices.",
    method: "GET", path: "/web-gateway/device-info/primary-training-device",
  }),
  e("devices", {
    id: "get_device_solar_data", title: "Get device solar data",
    description: "Return solar input for a device over one day or a range.",
    method: "GET", path: "/web-gateway/solar/{deviceId}/{start}/{end}",
    params: { singleDayView: r("boolean") }, pathParams: ["deviceId", "start", "end"], verified: "yes",
    notes: "Omitted enddate equals startdate and sets singleDayView=true; otherwise false.",
  }),
  e("devices", {
    id: "get_device_alarms", title: "List device alarms",
    description: "Aggregate active alarms from every registered device's settings.",
    method: "GET", path: "/device-service/deviceservice/device-info/settings/{deviceId}",
    pathParams: ["deviceId"],
    notes: "Composite: first calls get_devices, then this settings endpoint once per device and concatenates alarms.",
  }),
  e("devices", {
    id: "get_device_last_used", title: "Get last-used device",
    description: "Return the device that most recently synced.",
    method: "GET", path: "/device-service/deviceservice/mylastused",
  }),
  e("devices", {
    id: "push_workout_to_device", title: "Push workout to device",
    description: "Queue a workout FIT file for delivery to a device.",
    method: "POST", path: "/device-service/devicemessage/messages", body: "json",
    bodyDescription: "One-element list of device message objects with workout messageUrl, name, IDs, and FIT metadata.",
    write: true, verified: "yes",
    notes: "Composite body shaping: omitted IDs require last-used-device/workout-list lookups; always fetches workoutName.",
  }),
  e("devices", {
    id: "get_all_devices", title: "List all devices",
    description: "Return all registered devices, including inactive devices.",
    method: "GET", path: "/device-service/deviceregistration/devices/all/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("devices", {
    id: "get_historical_devices", title: "List historical devices",
    description: "Return previously registered devices.",
    method: "GET", path: "/device-service/deviceregistration/devices/historical", verified: "yes",
  }),
  e("devices", {
    id: "get_active_devices", title: "List active devices",
    description: "Return information for currently active devices.",
    method: "GET", path: "/device-service/deviceservice/device-info/active/{displayName}",
    pathParams: ["displayName"], verified: "yes", notes: "Requires displayName.",
  }),
  e("devices", {
    id: "get_user_device", title: "Get user device",
    description: "Return registration and last upload/download timestamps for a device.",
    method: "GET", path: "/device-service/deviceservice/user-device/{deviceId}", pathParams: ["deviceId"], verified: "yes",
  }),
  e("devices", {
    id: "get_device_app_info", title: "Get device app information",
    description: "Return device type and software information.",
    method: "GET", path: "/device-service/deviceservice/app-info/device/{deviceId}", pathParams: ["deviceId"], verified: "yes",
  }),
  e("devices", {
    id: "get_sensors", title: "List paired sensors",
    description: "Return paired external sensors such as heart-rate straps and power meters.",
    method: "GET", path: "/device-service/sensors", verified: "yes-empty",
  }),
  e("devices", {
    id: "get_device_messages", title: "Get device message queue",
    description: "Return pending software updates, pushed workouts, and other device messages.",
    method: "GET", path: "/device-service/devicemessage/messages", verified: "yes",
  }),
  e("devices", {
    id: "get_device_displayed_activities", title: "Get displayed device activities",
    description: "Return activity profiles shown on a device.",
    method: "GET", path: "/devicesettings-service/device/displayed-activities/{deviceId}",
    pathParams: ["deviceId"], verified: "yes-empty",
  }),
  e("devices", {
    id: "update_device_settings", title: "Update device settings",
    description: "Write a partial device-settings object such as alarm or tracking options.",
    method: "PUT", path: "/device-service/deviceservice/device-info/settings/{deviceId}",
    pathParams: ["deviceId"], body: "json", bodyDescription: "Non-empty partial settings object.",
    write: true, verified: "no",
  }),
  e("devices", {
    id: "get_device_solar_gain", title: "Get device solar gain",
    description: "Return daily solar gain over a range from the current device-monitoring endpoint.",
    method: "GET", path: "/device-service/devicemonitoring/solargain/{deviceId}/{start}/{end}",
    pathParams: ["deviceId", "start", "end"], verified: "yes-empty",
  }),
  e("devices", {
    id: "send_scheduled_workouts_to_devices", title: "Send scheduled workouts",
    description: "Push all scheduled workouts to the user's devices.",
    method: "PUT", path: "/workout-service/schedule/sendtodevices",
    write: true, verified: "no", notes: "No request body.",
  }),

  // Workout library and scheduling (workouts.py)
  e("workouts", {
    id: "get_workouts", title: "List workouts",
    description: "Return a filtered page of workout templates.",
    method: "GET", path: "/workout-service/workouts",
    params: {
      start: d("integer", 0), limit: d("integer", 100), myWorkoutsOnly: o("boolean"),
      sharedWorkoutsOnly: o("boolean"), includeAtp: o("boolean"), orderBy: o("string"),
      orderSeq: o("string"), sportTypeKey: o("string[]"),
    },
    verified: "yes",
  }),
  e("workouts", {
    id: "get_workout_by_id", title: "Get workout",
    description: "Return one workout template from the library.",
    method: "GET", path: "/workout-service/workout/{workoutId}", pathParams: ["workoutId"],
  }),
  e("workouts", {
    id: "delete_workout", title: "Delete workout",
    description: "Delete a workout template from the library.",
    method: "DELETE", path: "/workout-service/workout/{workoutId}",
    pathParams: ["workoutId"], write: true, destructive: true,
  }),
  e("workouts", {
    id: "download_workout", title: "Download workout FIT",
    description: "Download a workout template as FIT bytes.",
    method: "GET", path: "/workout-service/workout/FIT/{workoutId}",
    pathParams: ["workoutId"], body: "download", bodyDescription: "FIT bytes.", download: true,
  }),
  e("workouts", {
    id: "upload_workout", title: "Upload workout",
    description: "Create a workout from a JSON object or array.",
    method: "POST", path: "/workout-service/workout", body: "json",
    bodyDescription: "Complete workout object or array; JSON strings are parsed before sending.", write: true,
  }),
  e("workouts", {
    id: "update_workout", title: "Replace workout",
    description: "Replace a workout in place while preserving its identifier.",
    method: "PUT", path: "/workout-service/workout/{workoutId}",
    pathParams: ["workoutId"], body: "json",
    bodyDescription: "Complete workout object with workoutId forced to match the path.",
    write: true, destructive: true, notes: "Full replacement; calendar schedules retain the same workoutId.",
  }),
  e("workouts", {
    id: "upload_running_workout", title: "Upload running workout",
    description: "Serialize and upload a typed running workout.",
    method: "POST", path: "/workout-service/workout", body: "json", bodyDescription: "RunningWorkout.to_dict() payload.",
    write: true, notes: "Runtime must provide equivalent typed-model serialization if this convenience method is exposed.",
  }),
  e("workouts", {
    id: "upload_cycling_workout", title: "Upload cycling workout",
    description: "Serialize and upload a typed cycling workout.",
    method: "POST", path: "/workout-service/workout", body: "json", bodyDescription: "CyclingWorkout.to_dict() payload.",
    write: true, notes: "Runtime must provide equivalent typed-model serialization if this convenience method is exposed.",
  }),
  e("workouts", {
    id: "upload_swimming_workout", title: "Upload swimming workout",
    description: "Serialize and upload a typed swimming workout.",
    method: "POST", path: "/workout-service/workout", body: "json", bodyDescription: "SwimmingWorkout.to_dict() payload.",
    write: true, notes: "Runtime must provide equivalent typed-model serialization if this convenience method is exposed.",
  }),
  e("workouts", {
    id: "upload_strength_workout", title: "Upload strength workout",
    description: "Serialize and upload a typed strength workout.",
    method: "POST", path: "/workout-service/workout", body: "json", bodyDescription: "StrengthWorkout.to_dict() payload.",
    write: true, notes: "Runtime must provide equivalent typed-model serialization if this convenience method is exposed.",
  }),
  e("workouts", {
    id: "get_scheduled_workouts", title: "Get scheduled workouts by month",
    description: "Return calendar items for a month, including scheduled workouts.",
    method: "GET", path: "/calendar-service/year/{year}/month/{month}",
    pathParams: ["year", "month"], notes: "Runtime converts the public 1-based month to Garmin's 0-based month.",
  }),
  e("workouts", {
    id: "get_scheduled_workout_by_id", title: "Get scheduled workout",
    description: "Return one scheduled-workout calendar entry.",
    method: "GET", path: "/workout-service/schedule/{scheduledWorkoutId}", pathParams: ["scheduledWorkoutId"],
  }),
  e("workouts", {
    id: "get_next_scheduled_workout", title: "Get next scheduled workout",
    description: "Return the earliest visible workout scheduled today or later.",
    method: "GET", path: "/calendar-service/year/{year}/month/{month}",
    pathParams: ["year", "month"],
    notes: "Composite: reads current and next month, filters itemType=workout, and sorts by date. Adaptive plans need get_scheduled_workouts_by_period.",
  }),
  e("workouts", {
    id: "schedule_workout", title: "Schedule workout",
    description: "Add a workout template to the Garmin calendar.",
    method: "POST", path: "/workout-service/schedule/{workoutId}",
    pathParams: ["workoutId"], body: "json", bodyDescription: "{ date }.", write: true,
  }),
  e("workouts", {
    id: "unschedule_workout", title: "Unschedule workout",
    description: "Remove a scheduled workout without deleting its template.",
    method: "DELETE", path: "/workout-service/schedule/{scheduledWorkoutId}",
    pathParams: ["scheduledWorkoutId"], write: true, destructive: true,
  }),
  e("workouts", {
    id: "get_scheduled_workouts_by_period", title: "Get scheduled workouts by period",
    description: "Return scheduled workouts over a range, including adaptive-plan sessions.",
    method: "GET", path: "/workout-service/schedule/workoutScheduleByPeriod",
    params: { startDate: r("date"), endDate: r("date") }, verified: "yes-empty",
  }),
  e("workouts", {
    id: "get_workout_count", title: "Count workouts",
    description: "Return total and per-sport workout counts.",
    method: "GET", path: "/workout-service/workouts/count",
    params: { includeAtp: d("boolean", false) }, verified: "yes",
  }),
  e("workouts", {
    id: "get_workout_sport_types", title: "List workout sport types",
    description: "Return sport types that have workouts in the library.",
    method: "GET", path: "/workout-service/workouts/sport-types", verified: "yes",
  }),
  e("workouts", {
    id: "get_workout_types", title: "Get workout dictionaries",
    description: "Return step, condition, target, sport, and equipment type dictionaries.",
    method: "GET", path: "/workout-service/workout/types", verified: "yes",
  }),
  e("workouts", {
    id: "get_strength_benchmarks", title: "Get strength benchmarks",
    description: "Return strength benchmark exercises used for one-rep-max targets.",
    method: "GET", path: "/workout-service/benchmarks", verified: "yes",
  }),
  e("workouts", {
    id: "copy_workout", title: "Copy workout",
    description: "Duplicate a workout under a new name.",
    method: "POST", path: "/workout-service/workout/copy/{workoutId}",
    pathParams: ["workoutId"], body: "text", bodyDescription: "UTF-8 text/plain body containing only the new workout name.",
    write: true, verified: "yes",
  }),
  e("workouts", {
    id: "reschedule_workout", title: "Reschedule workout",
    description: "Move an existing scheduled workout to another date.",
    method: "PUT", path: "/workout-service/schedule/{scheduledWorkoutId}",
    pathParams: ["scheduledWorkoutId"], body: "json",
    bodyDescription: "Existing schedule entry with calendarDate replaced and workout reduced to workoutId.",
    write: true, verified: "yes", notes: "Runtime must GET the existing schedule before shaping the body.",
  }),

  // Training plans (training.py)
  e("training", {
    id: "get_active_training_plans", title: "Get active training plans",
    description: "Return training plans active on a date.",
    method: "GET", path: "/trainingplan-service/trainingplan/active-plans",
    params: { startDate: d("date", "today") }, verified: "yes-empty",
  }),
  e("training", {
    id: "get_training_plan_tasks", title: "Get training plan tasks",
    description: "Return workout tasks belonging to a training plan.",
    method: "GET", path: "/trainingplan-service/trainingplan/tasks/{planId}",
    params: { localeKey: d("string", "en") }, pathParams: ["planId"], verified: "yes",
  }),
  e("training", {
    id: "search_training_plans", title: "Search training plans",
    description: "Browse the Garmin training-plan catalogue without changing account data.",
    method: "POST", path: "/trainingplan-service/trainingplan/search",
    params: {
      start: d("integer", 1), limit: d("integer", 20), locale: d("string", "en"),
      types: o("string[]"), subTypes: o("string[]"), categories: o("string[]"), version: o("string"),
    },
    body: "form", bodyDescription: "Empty application/x-www-form-urlencoded body.",
    verified: "yes", notes: "Read-only despite POST. Additional validated query filters are passed through by Python.",
  }),
  e("training", {
    id: "schedule_training_plan", title: "Schedule training plan",
    description: "Schedule a catalogue training plan beginning on a date.",
    method: "GET", path: "/trainingplan-service/trainingplan/schedule/{planId}",
    params: { startDate: r("date") }, pathParams: ["planId"], write: true, destructive: false, verified: "no",
    notes: "Side-effecting GET exactly as Garmin's web app uses; runtime must not treat GET as inherently read-only.",
  }),
  e("training", {
    id: "delete_training_plan", title: "Delete scheduled training plan",
    description: "Remove a scheduled training plan from the calendar.",
    method: "DELETE", path: "/trainingplan-service/trainingplan/trainingplan/{planId}",
    pathParams: ["planId"], write: true, destructive: true, verified: "no",
  }),
  e("training", {
    id: "get_training_plans", title: "List training plans",
    description: "Return the user's training plans with optional pagination and status filtering.",
    method: "GET", path: "/trainingplan-service/trainingplan/plans",
    params: { limit: o("integer"), start: o("integer"), status: o("string") }, verified: "yes",
  }),
  e("training", {
    id: "get_training_plan_by_id", title: "Get phased training plan",
    description: "Return details for a phased training plan.",
    method: "GET", path: "/trainingplan-service/trainingplan/phased/{planId}", pathParams: ["planId"],
  }),
  e("training", {
    id: "get_adaptive_training_plan_by_id", title: "Get adaptive training plan",
    description: "Return details for an adaptive training plan.",
    method: "GET", path: "/trainingplan-service/trainingplan/fbt-adaptive/{planId}", pathParams: ["planId"],
  }),

  // Calendar events and notes (training.py)
  e("calendar", {
    id: "get_calendar_year", title: "Get calendar year",
    description: "Return a year overview showing days with calendar items.",
    method: "GET", path: "/calendar-service/year/{year}", pathParams: ["year"], verified: "yes",
  }),
  e("calendar", {
    id: "get_calendar_week", title: "Get calendar week",
    description: "Return calendar items for the week containing a date.",
    method: "GET", path: "/calendar-service/year/{year}/month/{month}/day/{day}/start/{firstDayOfWeek}",
    pathParams: ["year", "month", "day", "firstDayOfWeek"], verified: "yes",
    notes: "Runtime splits date (default today), converts month to 0-based, and defaults firstDayOfWeek to 1 (Monday).",
  }),
  e("calendar", {
    id: "get_calendar_events", title: "Get calendar events",
    description: "Return race and goal events over a range.",
    method: "GET", path: "/calendar-service/events",
    params: { startDate: r("date"), endDate: r("date") }, verified: "yes",
  }),
  e("calendar", {
    id: "get_upcoming_events", title: "Get upcoming events",
    description: "Return upcoming race and goal events.",
    method: "GET", path: "/calendar-service/events/upcoming",
    params: { numDaysForward: d("integer", 90), limit: d("integer", 10) }, verified: "yes",
  }),
  e("calendar", {
    id: "get_primary_event", title: "Get primary event",
    description: "Return the primary focus race event, or no event.",
    method: "GET", path: "/calendar-service/event/primary", verified: "yes", notes: "Python maps 204/404 to None.",
  }),
  e("calendar", {
    id: "get_calendar_event", title: "Get calendar event",
    description: "Return one race or goal event.",
    method: "GET", path: "/calendar-service/event/{eventId}", pathParams: ["eventId"], verified: "yes",
  }),
  e("calendar", {
    id: "create_calendar_event", title: "Create calendar event",
    description: "Create a race or goal event from a full event object.",
    method: "POST", path: "/calendar-service/event", body: "json",
    bodyDescription: "Full get_calendar_event-shaped object.", write: true, verified: "no",
  }),
  e("calendar", {
    id: "update_calendar_event", title: "Replace calendar event",
    description: "Replace a race or goal event with a full event object.",
    method: "PUT", path: "/calendar-service/event/{eventId}",
    pathParams: ["eventId"], body: "json", bodyDescription: "Full get_calendar_event-shaped object.",
    write: true, destructive: true, verified: "no",
  }),
  e("calendar", {
    id: "delete_calendar_event", title: "Delete calendar event",
    description: "Delete a race or goal event.",
    method: "DELETE", path: "/calendar-service/event/{eventId}",
    pathParams: ["eventId"], write: true, destructive: true, verified: "no",
  }),
  e("calendar", {
    id: "move_calendar_item", title: "Move calendar item",
    description: "Move a workout, note, or other calendar item to another date.",
    method: "PUT", path: "/calendar-service/calendarItem/{itemType}/{itemId}/date/{date}",
    pathParams: ["itemType", "itemId", "date"], body: "json",
    bodyDescription: "Supplied item object (or empty object) with date overwritten.",
    write: true, verified: "no", notes: "Custom body shaping adds date; itemType is the calendar item's itemType key.",
  }),
  e("calendar", {
    id: "create_calendar_note", title: "Create calendar note",
    description: "Add a note to a calendar day.",
    method: "POST", path: "/calendar-service/note", body: "json",
    bodyDescription: "{ noteName, content, date }; content defaults to an empty string.",
    write: true, verified: "yes",
  }),
  e("calendar", {
    id: "update_calendar_note", title: "Update calendar note",
    description: "Change a calendar note's date, name, or content.",
    method: "PUT", path: "/calendar-service/note/{noteId}",
    pathParams: ["noteId"], body: "json", bodyDescription: "{ id, noteName, content, date }.",
    write: true, verified: "yes",
  }),
  e("calendar", {
    id: "delete_calendar_note", title: "Delete calendar note",
    description: "Delete a note from the calendar.",
    method: "DELETE", path: "/calendar-service/note/{noteId}",
    pathParams: ["noteId"], write: true, destructive: true, verified: "yes",
  }),

  // Courses and PacePro (training.py)
  e("courses", {
    id: "get_courses", title: "List courses",
    description: "Return courses owned by the user.",
    method: "GET", path: "/course-service/course/owner/{displayName}",
    pathParams: ["displayName"], verified: "yes-empty", notes: "Requires displayName.",
  }),
  e("courses", {
    id: "get_course", title: "Get course",
    description: "Return a course including its geographic points.",
    method: "GET", path: "/course-service/course/{courseId}", pathParams: ["courseId"], verified: "no",
  }),
  e("courses", {
    id: "create_course", title: "Create course",
    description: "Create a course from a complete course object.",
    method: "POST", path: "/course-service/course", body: "json",
    bodyDescription: "Full get_course-shaped object.", write: true, verified: "no", notes: "Reference uses a 30-second timeout.",
  }),
  e("courses", {
    id: "update_course", title: "Replace course",
    description: "Replace a course with a complete course object.",
    method: "PUT", path: "/course-service/course/{courseId}",
    pathParams: ["courseId"], body: "json", bodyDescription: "Full get_course-shaped object.",
    write: true, destructive: true, verified: "no", notes: "Reference uses a 30-second timeout.",
  }),
  e("courses", {
    id: "delete_course", title: "Delete course",
    description: "Delete a course.",
    method: "DELETE", path: "/course-service/course/{courseId}",
    pathParams: ["courseId"], write: true, destructive: true, verified: "no",
  }),
  e("courses", {
    id: "download_course", title: "Download course as GPX",
    description: "Download a course as GPX; this is the Python default.",
    method: "GET", path: "/course-service/course/gpx/{courseId}",
    pathParams: ["courseId"], body: "download", bodyDescription: "GPX bytes.", download: true, verified: "no",
    notes: "fmt=fit dispatches to .fit.",
  }),
  e("courses", {
    id: "download_course.fit", title: "Download course as FIT",
    description: "Download a course as FIT with elevation data.",
    method: "GET", path: "/course-service/course/fit/{courseId}/0",
    params: { elevation: d("boolean", true) }, pathParams: ["courseId"],
    body: "download", bodyDescription: "FIT bytes.", download: true, verified: "no",
  }),
  e("courses", {
    id: "import_course", title: "Import course",
    description: "Import a GPX, TCX, or FIT course file.",
    method: "POST", path: "/course-service/course/import", body: "multipart",
    bodyDescription: "Multipart field `file` containing the course file.", write: true, verified: "no",
    notes: "Requires local file streaming and extension validation; reference uses a 60-second timeout.",
  }),
  e("courses", {
    id: "convert_activity_to_course", title: "Convert activity to course",
    description: "Build an unsaved course object from an activity track.",
    method: "GET", path: "/course-service/course/convert/activity/{activityId}",
    pathParams: ["activityId"], verified: "yes", notes: "Read-only conversion; pass the result to create_course to persist it.",
  }),
  e("courses", {
    id: "get_course_favorites", title: "List favorite courses",
    description: "Return courses marked as favorite.",
    method: "GET", path: "/course-service/course/favorites", verified: "yes-empty",
  }),
  e("courses", {
    id: "set_course_favorite", title: "Favorite course",
    description: "Add a course to favorites.",
    method: "POST", path: "/course-service/course/favorites", body: "json",
    bodyDescription: "{ courseId }.", write: true, verified: "no", notes: "favorite=false dispatches to .remove.",
  }),
  e("courses", {
    id: "set_course_favorite.remove", title: "Unfavorite course",
    description: "Remove a course from favorites.",
    method: "DELETE", path: "/course-service/course/favorites/course/{courseId}",
    pathParams: ["courseId"], write: true, destructive: true, verified: "no",
  }),
  e("courses", {
    id: "get_pace_bands", title: "Get PacePro pace bands",
    description: "Return the user's PacePro pace bands.",
    method: "GET", path: "/course-service/pacebands", verified: "yes-empty",
  }),

  // Asynchronous PDF reports (training.py)
  e("reports", {
    id: "request_report", title: "Request PDF report",
    description: "Start an asynchronous blood-pressure or Health Snapshot report export.",
    method: "POST", path: "/reportexport-service/export/init/{category}/{start}/{end}",
    params: { locale: d("string", "en-US") }, pathParams: ["category", "start", "end"],
    body: "json", bodyDescription: "Category-specific options object, or {} when options is null.",
    write: true, verified: "no",
    notes: "Returns reportId; poll get_report_status until READY, then call download_report.",
  }),
  e("reports", {
    id: "get_report_status", title: "Get report status",
    description: "Return asynchronous report-export progress.",
    method: "GET", path: "/reportexport-service/export/reportStatus/{reportId}",
    pathParams: ["reportId"], verified: "no",
  }),
  e("reports", {
    id: "download_report", title: "Download PDF report",
    description: "Download a completed report as PDF bytes.",
    method: "GET", path: "/reportexport-service/export/reportContent/{reportId}",
    pathParams: ["reportId"], body: "download", bodyDescription: "PDF bytes.", download: true, verified: "no",
  }),

  // Menstrual cycle and pregnancy tracking (womens_health.py)
  e("womens-health", {
    id: "get_menstrual_data_for_date", title: "Get menstrual day view",
    description: "Return menstrual tracking details and predictions for a date.",
    method: "GET", path: "/periodichealth-service/menstrualcycle/dayview/{date}",
    params: { todayDate: d("date", "today") }, pathParams: ["date"],
  }),
  e("womens-health", {
    id: "get_menstrual_calendar_data", title: "Get menstrual calendar",
    description: "Return cycle summaries intersecting a date range.",
    method: "GET", path: "/periodichealth-service/menstrualcycle/calendar/{start}/{end}",
    pathParams: ["start", "end"], notes: "Keep ranges to 90 days or fewer; Garmin rejects a 92-inclusive-day window.",
  }),
  e("womens-health", {
    id: "get_menstrual_last_confirmed", title: "Get last confirmed menstrual cycle",
    description: "Return the last confirmed menstrual cycle as of a date.",
    method: "GET", path: "/periodichealth-service/menstrualcycle/lastconfirmed/{date}", pathParams: ["date"],
  }),
  e("womens-health", {
    id: "get_menstrual_cycle_summary", title: "Get menstrual cycle summary",
    description: "Return the menstrual cycle summary for a date.",
    method: "GET", path: "/periodichealth-service/menstrualcycle/summary/{date}", pathParams: ["date"],
  }),
  e("womens-health", {
    id: "get_menstrual_reports", title: "Get menstrual reports",
    description: "Return reports for one, six, or twelve cycles ending at a date.",
    method: "GET", path: "/periodichealth-service/reports/menstrualcycle/{cycles}/{date}",
    params: {
      next: d("boolean", false), reportType: d("string", "CYCLE"), todayCalendarDate: d("date", "today"),
    },
    pathParams: ["cycles", "date"], notes: "cycles defaults to 6 and must be 1, 6, or 12.",
  }),
  e("womens-health", {
    id: "get_pregnancy_summary", title: "Get pregnancy summary",
    description: "Return the current pregnancy snapshot.",
    method: "GET", path: "/periodichealth-service/menstrualcycle/pregnancysnapshot",
  }),
  e("womens-health", {
    id: "update_menstrual_daily_log", title: "Replace menstrual daily log",
    description: "Replace the full-day menstrual log snapshot for a date.",
    method: "POST", path: "/periodichealth-service/menstrualcycle/dailylog/{date}",
    pathParams: ["date"], body: "json",
    bodyDescription: "Full daily log with calendarDate, enum/list fields, notes, ovulationDay, reportTimestamp, and optional userProfilePk.",
    write: true, destructive: true,
    notes: "Custom body shaping adds timestamp/profileId. Omitted lists/scalars clear values; notes=null preserves, empty string clears.",
  }),
  e("womens-health", {
    id: "update_menstrual_calendar", title: "Replace menstrual calendar",
    description: "Replace confirmed period dates within a range.",
    method: "POST", path: "/periodichealth-service/menstrualcycle/calendarupdates", body: "json",
    bodyDescription: "{ todayCalendarDate, startDate, endDate, reportTimestamp, cycleDatesLists, futureEditsByFE: true, userProfilePk? }.",
    write: true, destructive: true,
    notes: "Full replacement within range; omitted confirmed days are removed. Runtime adds today's date, timestamp, and profileId.",
  }),
  e("womens-health", {
    id: "init_menstrual_cycle_setup", title: "Initialize menstrual tracking",
    description: "Initialize cycle tracking with the first confirmed period.",
    method: "POST", path: "/periodichealth-service/menstrualcycle/initCycleSetup", body: "json",
    bodyDescription: "{ periodStartDate, periodLength, cycleLength, reportTimestamp, userProfilePk? }.",
    write: true, notes: "First-run setup only; settings flags require a separate update_menstrual_settings call.",
  }),
  e("womens-health", {
    id: "confirm_menstrual_period_start", title: "Confirm menstrual period",
    description: "Confirm a period start, optionally converting a predicted cycle.",
    method: "POST", path: "/periodichealth-service/menstrualcycle/{date}", body: "json",
    bodyDescription: "{ periodStartDate, periodLength, cycleLength, predictedCycle, hasSpecifiedCycleLength: true, hasSpecifiedPeriodLength: true, reportTimestamp, userProfilePk? }.",
    pathParams: ["date"], write: true, notes: "Runtime adds timestamp/profileId; predictedCycle defaults to false.",
  }),
  e("womens-health", {
    id: "update_menstrual_settings", title: "Update menstrual settings",
    description: "Merge changes into userMenstrualCycleSettings on the user profile.",
    method: "PUT", path: "/userprofile-service/userprofile/user-settings", body: "json",
    bodyDescription: "{ userMenstrualCycleSettings: mergedSettings, id? }.",
    write: true, notes: "Runtime GETs get_user_profile, merges current settings, and reuses profile id when not supplied.",
  }),

  // Golf (golf.py)
  e("golf", {
    id: "get_golf_summary", title: "List golf scorecards",
    description: "Return a page of golf scorecard summaries.",
    method: "GET", path: "/gcs-golfcommunity/api/v2/scorecard/summary",
    params: { "per-page": d("integer", 100), start: d("integer", 0) },
  }),
  e("golf", {
    id: "get_golf_scorecard", title: "Get golf scorecard",
    description: "Return scorecard detail including longest-shot distance.",
    method: "GET", path: "/gcs-golfcommunity/api/v2/scorecard/detail",
    params: { "scorecard-ids": r("string"), "include-longest-shot-distance": d("boolean", true) },
  }),
  e("golf", {
    id: "get_golf_shot_data", title: "Get golf shot data",
    description: "Return shot data for all or selected holes on a scorecard.",
    method: "GET", path: "/gcs-golfcommunity/api/v2/shot/scorecard/{scorecardId}/hole",
    params: { "hole-numbers": o("string") }, pathParams: ["scorecardId"],
    notes: "Runtime replaces commas with dashes; any requested hole 10-18 requires omitting the filter and returning all holes.",
  }),
  e("golf", {
    id: "get_golf_club_stats", title: "Get golf club statistics",
    description: "Return club names and distance statistics.",
    method: "GET", path: "/gcs-golfcommunity/api/v2/club/player",
    params: { "per-page": d("integer", 1000), "include-stats": d("boolean", true) },
  }),
  e("golf", {
    id: "get_golf_user_stats", title: "Get golf user statistics",
    description: "Return handicap, strokes-gained, and overview statistics.",
    method: "GET", path: "/gcs-golfcommunity/api/v2/player/stats",
  }),

  // GraphQL gateway (base.py and docs/graphql_operations.md)
  e("graphql", {
    id: "query_garmin_graphql", title: "Query Garmin GraphQL",
    description: "Send an arbitrary GraphQL request body to the dashboard gateway.",
    method: "POST", path: "/graphql-gateway/graphql", body: "json",
    bodyDescription: "GraphQL request object such as { query, variables? }; the body is forwarded unchanged.",
    notes: "Known dashboard root fields and selection sets are listed in docs/API_COVERAGE.md. Read-only for documented anonymous queries.",
  })
];

export const ENDPOINT_MAP = Object.freeze(
  Object.fromEntries(ENDPOINTS.map((endpoint) => [endpoint.id, endpoint])),
) as Readonly<Record<string, EndpointDefinition>>;

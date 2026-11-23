# Garmin Connect API coverage

This document is generated from `src/garmin/catalog.ts`. It describes the request surface to implement in our own TypeScript HTTP runtime; it does not import or execute the Python reference library.

## Provenance and verification

- Reference: `python-garminconnect` commit `82bc11073b597d20f8b080b7aeaac8d4cef4fc3e`, commit date **2026-10-31**.
- Inputs reviewed: `garminconnect/api/base.py`, every public API mixin in `garminconnect/api/*.py`, `docs/API_ENDPOINTS.md`, and `docs/graphql_operations.md`.
- The reference's web-app comparison and live verification were performed in **October 2026**. This catalog was prepared on **2026-11-23**.
- **No live Garmin requests were made for this catalog.** Verification values below report the reference documentation, not testing by this project.
- `yes` means the reference observed HTTP 200 with the expected shape (or a documented unchanged-object write); `yes (empty)` means HTTP 200 with empty account data; `no` means the reference documented a request shape without confirming a response; `not documented` means no verification status was supplied for that exact operation. Neither negative value means the endpoint is known to be broken.

| Catalog metric | Count |
|---|---:|
| Supported public Python method IDs | 336 |
| Additional explicit request variants | 17 |
| Total endpoint definitions | 353 |
| Non-write definitions | 280 |
| Write definitions | 73 |
| Destructive definitions | 22 |
| Binary download definitions | 11 |
| Definitions requiring `{displayName}` | 31 |

The 17 variants represent real method/path/body differences within one Python method: alternative download formats, previous/next activity, latest/range metric forms, optional path segments, aggregated reports, and add/remove operations. They are not counted as additional Python methods.

### Public-method scope

The 336 method IDs cover every supported public HTTP-backed method in the reference mixins and `base.py`, including composite convenience methods and reads/writes. Base-class declarations are counted once with their mixin implementations.

Deliberately excluded:

- Authentication/session and generic transport: `login`, `resume_login`, `logout`, `connectapi`, `connectwebproxy`, and `download`.
- Local state/time helpers and wrappers: `typed`, `get_full_name`, `get_unit_system`, `now`, and `today`.
- `upload_walking_workout` and `upload_hiking_workout`: public stubs that always raise because Garmin has no corresponding workout sport type; neither makes an HTTP request.

## Counts by category

Method IDs are unique Python names; definitions include their request variants. All other columns count definitions.

| Category | Method IDs | Definitions | Writes | Destructive | Downloads |
|---|---:|---:|---:|---:|---:|
| Profile and account | 10 | 10 | 3 | 0 | 0 |
| Activities | 47 | 52 | 11 | 2 | 5 |
| Health and wellness | 70 | 71 | 5 | 2 | 2 |
| Performance metrics and biometrics | 46 | 54 | 2 | 0 | 0 |
| Weight, body composition, and blood pressure | 21 | 21 | 8 | 3 | 0 |
| Achievements, goals, badges, and challenges | 27 | 27 | 1 | 0 | 0 |
| Gear | 18 | 19 | 8 | 3 | 0 |
| Devices and sensors | 18 | 18 | 3 | 0 | 0 |
| Workouts and workout schedule | 22 | 22 | 11 | 3 | 1 |
| Training plans | 8 | 8 | 2 | 1 | 0 |
| Calendar | 13 | 13 | 7 | 3 | 0 |
| Courses and PacePro | 11 | 13 | 6 | 3 | 2 |
| PDF reports | 3 | 3 | 1 | 0 | 1 |
| Women's health | 11 | 11 | 5 | 2 | 0 |
| Golf | 5 | 5 | 0 | 0 | 0 |
| Nutrition | 5 | 5 | 0 | 0 | 0 |
| GraphQL gateway | 1 | 1 | 0 | 0 | 0 |
| **Total** | **336** | **353** | **73** | **22** | **11** |

## Request and safety conventions

- Paths are relative to the region's `connectapi` origin unless shown as absolute URLs. `Region="global"` selects `garmin.com`; `Region="china"` selects `garmin.cn`. ECG uses `https://ghs.{domain}/...` on the corresponding sibling host.
- The runtime must substitute and **percent-encode every path placeholder**, including `{displayName}` and identifiers. It must not interpolate raw user/profile data into a URL.
- Dates are `YYYY-MM-DD`. A query default of `today` means today in the user's Garmin profile timezone, not the server machine's timezone. `{startDate}` as a default means copy the resolved `startDate`. Path-level computed defaults are described in catalog notes.
- Array query values are repeated parameters. Booleans use lowercase `true`/`false` where the reference's web-compatible serialization requires it. Optional parameters with default `null` are omitted; explicit runtime null handling is noted where it differs.
- `write` describes side effects, not the HTTP verb. In particular, `schedule_training_plan` is a **side-effecting GET** with `write=true, destructive=false`; `search_training_plans` is a read-only POST; `convert_activity_to_course` is a read-only GET; and `request_report` starts an export job.
- `destructive` marks deletes, unlink/remove operations, and full replacements that can discard existing state. Ordinary partial edits are not automatically marked destructive.
- `body="download"` is a response-handling marker, not a request payload: return raw bytes rather than parsing JSON. `multipart`, `text`, and empty `form` requests need dedicated transport support.
- Catalog verification does not include response schemas, per-field validation, rate limiting, or every regional/account-specific behavior. Those remain runtime responsibilities.

## Endpoint definitions

A dash means false. Verification values are inherited from the reference as explained above. Detailed defaults, body shapes, and caveats are in `catalog.ts`; this table is intentionally compact.

### Profile and account (10)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_user_timezone` | GET | `/userprofile-service/userprofile/personal-information/{displayName}` | — | — | — | yes |
| `get_user_profile` | GET | `/userprofile-service/userprofile/user-settings` | — | — | — | not documented |
| `get_userprofile_settings` | GET | `/userprofile-service/userprofile/settings` | — | — | — | not documented |
| `update_user_settings` | PUT | `/userprofile-service/userprofile/user-settings` | yes | — | — | yes |
| `set_primary_training_device` | PUT | `/userprofile-service/userprofile/user-settings/primary-training-device` | yes | — | — | yes |
| `request_reload` | POST | `/wellness-service/wellness/epoch/request/{date}` | yes | — | — | not documented |
| `get_personal_information` | GET | `/userprofile-service/userprofile/personal-information/{displayName}` | — | — | — | yes |
| `get_user_profile_base` | GET | `/userprofile-service/userprofile/userProfileBase` | — | — | — | yes |
| `get_privacy_settings` | GET | `/privacysettings-service/privacy-settings` | — | — | — | yes |
| `get_usage_indicators` | GET | `/web-gateway/snapshot/usageIndicators` | — | — | — | yes |

### Activities (52)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `count_activities` | GET | `/activitylist-service/activities/count` | — | — | — | not documented |
| `get_activities` | GET | `/activitylist-service/activities/search/activities` | — | — | — | not documented |
| `get_activities_fordate` | GET | `/mobile-gateway/heartRate/forDate/{date}` | — | — | — | not documented |
| `update_activity` | PUT | `/activity-service/activity/{activityId}` | yes | — | — | yes |
| `set_activity_name` | PUT | `/activity-service/activity/{activityId}` | yes | — | — | not documented |
| `set_activity_type` | PUT | `/activity-service/activity/{activityId}` | yes | — | — | not documented |
| `set_activity_description` | PUT | `/activity-service/activity/{activityId}` | yes | — | — | not documented |
| `create_manual_activity_from_json` | POST | `/activity-service/activity` | yes | — | — | not documented |
| `create_manual_activity` | POST | `/activity-service/activity` | yes | — | — | not documented |
| `get_last_activity` | GET | `/activitylist-service/activities/search/activities` | — | — | — | not documented |
| `upload_activity` | POST | `/upload-service/upload` | yes | — | — | yes |
| `import_activity` | POST | `/upload-service/upload/{extension}` | yes | — | — | not documented |
| `delete_activity` | DELETE | `/activity-service/activity/{activityId}` | yes | yes | — | not documented |
| `get_activities_by_date` | GET | `/activitylist-service/activities/search/activities` | — | — | — | not documented |
| `get_progress_summary_between_dates` | GET | `/fitnessstats-service/activity` | — | — | — | yes |
| `get_training_load_activities` | GET | `/fitnessstats-service/activity/all` | — | — | — | not documented |
| `get_activity_types` | GET | `/activity-service/activity/activityTypes` | — | — | — | not documented |
| `download_activity` | GET | `/download-service/export/tcx/activity/{activityId}` | — | — | yes | not documented |
| `download_activity.original` | GET | `/download-service/files/activity/{activityId}` | — | — | yes | not documented |
| `download_activity.gpx` | GET | `/download-service/export/gpx/activity/{activityId}` | — | — | yes | not documented |
| `download_activity.kml` | GET | `/download-service/export/kml/activity/{activityId}` | — | — | yes | not documented |
| `download_activity.csv` | GET | `/download-service/export/csv/activity/{activityId}` | — | — | yes | not documented |
| `get_activity_splits` | GET | `/activity-service/activity/{activityId}/splits` | — | — | — | not documented |
| `get_activity_typed_splits` | GET | `/activity-service/activity/{activityId}/typedsplits` | — | — | — | not documented |
| `get_activity_split_summaries` | GET | `/activity-service/activity/{activityId}/split_summaries` | — | — | — | not documented |
| `get_activity_weather` | GET | `/activity-service/activity/{activityId}/weather` | — | — | — | not documented |
| `get_activity_hr_in_timezones` | GET | `/activity-service/activity/{activityId}/hrTimeInZones` | — | — | — | not documented |
| `get_activity_power_in_timezones` | GET | `/activity-service/activity/{activityId}/powerTimeInZones` | — | — | — | not documented |
| `get_activity` | GET | `/activity-service/activity/{activityId}` | — | — | — | not documented |
| `get_activity_details` | GET | `/activity-service/activity/{activityId}/details` | — | — | — | not documented |
| `get_activity_images` | GET | `/activity-service/activity/{activityId}` | — | — | — | not documented |
| `get_activity_exercise_sets` | GET | `/activity-service/activity/{activityId}/exerciseSets` | — | — | — | not documented |
| `set_activity_exercise_sets` | PUT | `/activity-service/activity/{activityId}/exerciseSets` | yes | yes | — | not documented |
| `get_available_metrics` | GET | `/fitnessstats-service/activity/availableMetrics` | — | — | — | yes |
| `get_weekly_activity_stats` | GET | `/userstats-service/activities/weekly/{displayName}` | — | — | — | yes |
| `search_activities` | GET | `/activitylist-service/activities/search/activities` | — | — | — | yes |
| `get_fastest_splits` | GET | `/activitylist-service/activities/fastest-splits` | — | — | — | yes |
| `get_favorite_activities` | GET | `/activitylist-service/activities/favorite/{displayName}` | — | — | — | yes (empty) |
| `set_activity_favorite` | PUT | `/activity-service/activity/{activityId}` | yes | — | — | yes |
| `get_activity_laps` | GET | `/activity-service/activity/{activityId}/laps` | — | — | — | yes |
| `get_activity_rounds` | GET | `/activity-service/activity/{activityId}/rounds` | — | — | — | yes (empty) |
| `get_activity_step_details` | GET | `/activity-service/activity/{activityId}/stepdetails` | — | — | — | yes (empty) |
| `get_activity_jump_details` | GET | `/activity-service/activity/{activityId}/jumpDetails` | — | — | — | yes (empty) |
| `get_activity_subsecond_details` | GET | `/activity-service/activity/{activityId}/subseconddetails` | — | — | — | yes (empty) |
| `get_activity_swim_details` | GET | `/activity-service/activity/{activityId}/swimDetails` | — | — | — | yes (empty) |
| `get_activity_map_details` | GET | `/activity-service/activity/{activityId}/mapdetails` | — | — | — | yes |
| `get_activity_polyline` | GET | `/activity-service/activity/polyline/{activityId}` | — | — | — | yes |
| `get_activity_power_curve` | GET | `/activity-service/activity/{activityId}/powerCurve` | — | — | — | yes (empty) |
| `get_adjacent_activities` | GET | `/activity-service/activity/{activityId}/prev` | — | — | — | yes |
| `get_adjacent_activities.next` | GET | `/activity-service/activity/{activityId}/next` | — | — | — | yes |
| `get_activity_event_types` | GET | `/activity-service/activity/eventTypes` | — | — | — | yes |
| `get_activity_segments` | GET | `/segment-service/segment/list/{activityId}` | — | — | — | yes (empty) |

### Health and wellness (71)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_stats` | GET | `/usersummary-service/usersummary/daily/{displayName}` | — | — | — | not documented |
| `get_user_summary` | GET | `/usersummary-service/usersummary/daily/{displayName}` | — | — | — | not documented |
| `get_steps_data` | GET | `/wellness-service/wellness/dailySummaryChart/{displayName}` | — | — | — | yes |
| `get_floors` | GET | `/wellness-service/wellness/floorsChartData/daily/{date}` | — | — | — | not documented |
| `get_daily_steps` | GET | `/usersummary-service/stats/steps/daily/{start}/{end}` | — | — | — | yes |
| `get_weekly_steps` | GET | `/usersummary-service/stats/steps/weekly/{end}/{weeks}` | — | — | — | not documented |
| `get_weekly_stress` | GET | `/usersummary-service/stats/stress/weekly/{end}/{weeks}` | — | — | — | not documented |
| `get_weekly_intensity_minutes` | GET | `/usersummary-service/stats/im/weekly/{start}/{end}` | — | — | — | not documented |
| `get_heart_rates` | GET | `/wellness-service/wellness/dailyHeartRate/{displayName}` | — | — | — | yes |
| `get_body_battery` | GET | `/wellness-service/wellness/bodyBattery/reports/daily` | — | — | — | not documented |
| `get_body_battery_events` | GET | `/wellness-service/wellness/bodyBattery/events/{date}` | — | — | — | not documented |
| `add_hydration_data` | PUT | `/usersummary-service/usersummary/hydration/log` | yes | — | — | not documented |
| `get_hydration_data` | GET | `/usersummary-service/usersummary/hydration/daily/{date}` | — | — | — | not documented |
| `get_respiration_data` | GET | `/wellness-service/wellness/daily/respiration/{date}` | — | — | — | not documented |
| `get_spo2_data` | GET | `/wellness-service/wellness/daily/spo2/{date}` | — | — | — | yes |
| `get_intensity_minutes_data` | GET | `/wellness-service/wellness/daily/im/{date}` | — | — | — | not documented |
| `get_all_day_stress` | GET | `/wellness-service/wellness/dailyStress/{date}` | — | — | — | not documented |
| `get_all_day_events` | GET | `/wellness-service/wellness/dailyEvents` | — | — | — | yes |
| `get_sleep_data` | GET | `/wellness-service/wellness/dailySleepData/{displayName}` | — | — | — | yes |
| `get_sleep_daily` | GET | `/sleep-service/stats/sleep/daily/{start}/{end}` | — | — | — | not documented |
| `get_stress_data` | GET | `/wellness-service/wellness/dailyStress/{date}` | — | — | — | not documented |
| `get_lifestyle_logging_data` | GET | `/lifestylelogging-service/dailyLog/{date}` | — | — | — | not documented |
| `get_rhr_day` | GET | `/userstats-service/wellness/daily/{displayName}` | — | — | — | not documented |
| `get_rhr_daily` | GET | `/userstats-service/wellness/daily/{displayName}` | — | — | — | not documented |
| `get_calories_daily` | GET | `/userstats-service/wellness/daily/{displayName}` | — | — | — | not documented |
| `get_hrv_data` | GET | `/hrv-service/hrv/{date}` | — | — | — | not documented |
| `get_hrv_data_range` | GET | `/hrv-service/hrv/daily/{start}/{end}` | — | — | — | not documented |
| `download_health_snapshot` | GET | `/download-service/files/wellness/{date}` | — | — | yes | not documented |
| `get_jetlag_trips` | GET | `/jetlag-service/jetlag/trip/all` | — | — | — | not documented |
| `add_jetlag_trip` | POST | `/jetlag-service/jetlag/trip` | yes | — | — | not documented |
| `update_jetlag_trip` | PUT | `/jetlag-service/jetlag/trip` | yes | yes | — | not documented |
| `delete_jetlag_trip` | DELETE | `/jetlag-service/jetlag/trip/{tripId}` | yes | yes | — | not documented |
| `get_daily_stats` | GET | `/usersummary-service/stats/daily/{start}/{end}` | — | — | — | yes |
| `get_daily_stats.aggregated` | GET | `/usersummary-service/stats/daily/aggregated/{start}/{end}` | — | — | — | yes |
| `get_daily_heart_rate_stats` | GET | `/usersummary-service/stats/heartRate/daily/{start}/{end}` | — | — | — | yes |
| `get_weekly_heart_rate_stats` | GET | `/usersummary-service/stats/heartRate/weekly/{end}/{weeks}` | — | — | — | yes |
| `get_daily_stress_stats` | GET | `/usersummary-service/stats/stress/daily/{start}/{end}` | — | — | — | yes |
| `get_daily_body_battery_stats` | GET | `/usersummary-service/stats/bodybattery/daily/{start}/{end}` | — | — | — | yes |
| `get_daily_intensity_minutes_stats` | GET | `/usersummary-service/stats/im/daily/{start}/{end}` | — | — | — | yes |
| `get_daily_respiration_stats` | GET | `/usersummary-service/stats/respiration/daily/{start}/{end}` | — | — | — | yes |
| `get_daily_floors_stats` | GET | `/usersummary-service/stats/floors/daily/{start}/{end}` | — | — | — | yes |
| `get_weekly_floors_stats` | GET | `/usersummary-service/stats/floors/weekly/{end}/{weeks}` | — | — | — | yes |
| `get_daily_hydration_stats` | GET | `/usersummary-service/stats/hydration/daily/{start}/{end}` | — | — | — | yes (empty) |
| `get_weekly_hydration_stats` | GET | `/usersummary-service/stats/hydration/weekly/{end}/{weeks}` | — | — | — | yes (empty) |
| `get_weekly_calories_stats` | GET | `/usersummary-service/stats/calories/weekly/{end}/{weeks}` | — | — | — | yes |
| `get_monthly_steps` | GET | `/usersummary-service/stats/steps/monthly/{end}/{months}` | — | — | — | yes |
| `get_stats_averages` | GET | `/usersummary-service/stats/averages/{start}/{end}` | — | — | — | yes |
| `get_lifetime_totals` | GET | `/usersummary-service/stats/connectLifetimeTotals/{displayName}` | — | — | — | yes |
| `get_daily_summaries` | GET | `/usersummary-service/v2/dailysummaries` | — | — | — | yes |
| `get_week_average_resting_hr` | GET | `/usersummary-service/usersummary/weekAverageRestingHR/{displayName}` | — | — | — | yes |
| `get_hydration_all_data` | GET | `/usersummary-service/usersummary/hydration/allData/{date}` | — | — | — | yes |
| `get_daily_movement` | GET | `/wellness-service/wellness/dailyMovement` | — | — | — | yes |
| `set_steps_goal` | PUT | `/wellness-service/wellness/wellness-goals/consolidated/steps/{date}` | yes | — | — | yes |
| `get_sync_timestamp` | GET | `/wellness-service/wellness/syncTimestamp` | — | — | — | yes |
| `get_hourly_intensity_minutes` | GET | `/wellness-service/stats/hourly/im/{end}/{days}` | — | — | — | yes |
| `get_weekly_wellness_stats` | GET | `/userstats-service/wellness/weekly/{displayName}` | — | — | — | yes |
| `get_monthly_wellness_stats` | GET | `/userstats-service/wellness/monthly/{displayName}` | — | — | — | yes |
| `get_user_statistics` | GET | `/userstats-service/statistics/{displayName}` | — | — | — | yes |
| `get_daily_sleep` | GET | `/sleep-service/sleep/dailySleepData` | — | — | — | yes |
| `get_naps` | GET | `/sleep-service/sleep/naps/{date}` | — | — | — | yes (empty) |
| `get_sleep_stats_weekly` | GET | `/sleep-service/stats/sleep/weekly/{end}/{weeks}` | — | — | — | yes |
| `get_sleep_stats_overall` | GET | `/sleep-service/stats/sleep/overall/{start}/{end}` | — | — | — | yes |
| `get_health_snapshots` | GET | `/wellnessactivity-service/activity/summary/{date}` | — | — | — | yes (empty) |
| `get_health_snapshots_range` | GET | `/wellnessactivity-service/activity/summary/range/{start}/{end}` | — | — | — | yes |
| `get_health_snapshot` | GET | `/wellnessactivity-service/activity/summary/{date}/{snapshotUuid}` | — | — | — | yes |
| `get_health_snapshot_epochs` | GET | `/wellnessactivity-service/activity/epoch/{snapshotUuid}` | — | — | — | yes |
| `download_health_snapshot_session` | GET | `/download-service/files/wellness/activity/{date}/{snapshotUuid}` | — | — | yes | yes |
| `get_ecg_daily` | GET | `https://ghs.{domain}/ghs/ecg/v1/ecg/daily` | — | — | — | yes |
| `get_ecg_list` | GET | `https://ghs.{domain}/ghs/ecg/v1/ecg/list` | — | — | — | yes |
| `get_ecg` | GET | `https://ghs.{domain}/ghs/ecg/v1/ecg/{ecgId}` | — | — | — | no |
| `get_jetlag_status` | GET | `/jetlag-service/jetlag/status/daily/{date}` | — | — | — | yes (empty) |

### Performance metrics and biometrics (54)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_max_metrics` | GET | `/metrics-service/metrics/maxmet/daily/{date}/{date}` | — | — | — | not documented |
| `get_max_metrics_range` | GET | `/metrics-service/metrics/maxmet/{aggregation}/{start}/{end}` | — | — | — | yes |
| `get_functional_threshold_power_range` | GET | `/biometric-service/stats/functionalThresholdPower/range/{start}/{end}` | — | — | — | not documented |
| `get_lactate_threshold` | GET | `/biometric-service/biometric/latestLactateThreshold` | — | — | — | not documented |
| `get_lactate_threshold.latest-power` | GET | `/biometric-service/biometric/powerToWeight/latest/{date}` | — | — | — | not documented |
| `get_lactate_threshold.range-speed` | GET | `/biometric-service/stats/lactateThresholdSpeed/range/{start}/{end}` | — | — | — | not documented |
| `get_lactate_threshold.range-heart-rate` | GET | `/biometric-service/stats/lactateThresholdHeartRate/range/{start}/{end}` | — | — | — | not documented |
| `get_lactate_threshold.range-power` | GET | `/biometric-service/stats/functionalThresholdPower/range/{start}/{end}` | — | — | — | not documented |
| `get_training_readiness` | GET | `/metrics-service/metrics/trainingreadiness/{date}` | — | — | — | not documented |
| `get_morning_training_readiness` | GET | `/metrics-service/metrics/trainingreadiness/{date}` | — | — | — | not documented |
| `get_training_four_week_load_balance` | GET | `/metrics-service/metrics/trainingloadbalance/latest/{date}` | — | — | — | not documented |
| `get_daily_training_status` | GET | `/metrics-service/metrics/trainingstatus/daily/{date}` | — | — | — | not documented |
| `get_endurance_score` | GET | `/metrics-service/metrics/endurancescore` | — | — | — | yes |
| `get_endurance_score.range` | GET | `/metrics-service/metrics/endurancescore/stats` | — | — | — | yes |
| `get_running_tolerance` | GET | `/metrics-service/metrics/runningtolerance/stats` | — | — | — | not documented |
| `get_race_predictions` | GET | `/metrics-service/metrics/racepredictions/latest/{displayName}` | — | — | — | not documented |
| `get_race_predictions.range` | GET | `/metrics-service/metrics/racepredictions/{aggregation}/{displayName}` | — | — | — | not documented |
| `get_training_status` | GET | `/metrics-service/metrics/trainingstatus/aggregated/{date}` | — | — | — | not documented |
| `get_fitnessage_data` | GET | `/fitnessage-service/fitnessage/{date}` | — | — | — | not documented |
| `get_hill_score` | GET | `/metrics-service/metrics/hillscore` | — | — | — | yes |
| `get_hill_score.range` | GET | `/metrics-service/metrics/hillscore/stats` | — | — | — | not documented |
| `get_cycling_ftp` | GET | `/biometric-service/biometric/latestFunctionalThresholdPower/CYCLING` | — | — | — | not documented |
| `get_heart_rate_zones` | GET | `/biometric-service/heartRateZones` | — | — | — | not documented |
| `get_power_zones` | GET | `/biometric-service/powerZones/sports/all` | — | — | — | not documented |
| `get_power_zones_for_sport` | GET | `/biometric-service/powerZones/sport/{sport}` | — | — | — | not documented |
| `get_max_metrics_latest` | GET | `/metrics-service/metrics/maxmet/latest/{date}` | — | — | — | yes |
| `get_training_readiness_range` | GET | `/metrics-service/metrics/trainingreadiness/{start}/{end}` | — | — | — | yes |
| `get_weekly_training_status` | GET | `/metrics-service/metrics/trainingstatus/weekly/{displayName}` | — | — | — | yes |
| `get_heat_altitude_acclimation` | GET | `/metrics-service/metrics/heataltitudeacclimation/latest/{date}` | — | — | — | yes |
| `get_heat_altitude_acclimation_range` | GET | `/metrics-service/metrics/heataltitudeacclimation/{aggregation}/{start}/{end}` | — | — | — | yes |
| `get_cycling_ability` | GET | `/metrics-service/metrics/cycling-ability/latest` | — | — | — | yes |
| `get_cycling_ability_range` | GET | `/metrics-service/metrics/cycling-ability` | — | — | — | yes |
| `get_running_economy` | GET | `/metrics-service/metrics/runningeconomy/latest/{date}` | — | — | — | yes (empty) |
| `get_running_economy_range` | GET | `/metrics-service/metrics/runningeconomy/{aggregation}` | — | — | — | yes (empty) |
| `get_stamina_curve` | GET | `/metrics-service/metrics/stamina-curve/latest` | — | — | — | yes (empty) |
| `update_heart_rate_zones` | PUT | `/biometric-service/heartRateZones/` | yes | — | — | yes |
| `update_power_zones` | PUT | `/biometric-service/powerZones/all` | yes | — | — | yes |
| `get_heart_rate_zones_v2` | GET | `/biometric-service/heartRateZones/v2` | — | — | — | yes |
| `get_biometric_stats` | GET | `/biometric-service/stats` | — | — | — | yes |
| `get_power_to_weight_range` | GET | `/biometric-service/stats/powerToWeight/range/{start}/{end}` | — | — | — | yes |
| `get_critical_swim_speed` | GET | `/biometric-service/criticalSwimSpeed/latest/{date}` | — | — | — | yes (empty) |
| `get_critical_swim_speed_range` | GET | `/biometric-service/criticalSwimSpeed/range/{start}/{end}` | — | — | — | yes (empty) |
| `get_glucose_data` | GET | `/biometric-service/biometric/glucose/{date}` | — | — | — | yes (empty) |
| `get_glucose_data_range` | GET | `/biometric-service/biometric/glucose/{start}/{end}` | — | — | — | yes (empty) |
| `get_current_biometrics` | GET | `/userprofile-service/biometric/current/{displayName}` | — | — | — | yes |
| `get_power_curve` | GET | `/fitnessstats-service/powerCurve` | — | — | — | yes (empty) |
| `get_one_rep_max` | GET | `/fitnessstats-service/vbt-stats/one-rep-max/current/{date}` | — | — | — | yes (empty) |
| `get_one_rep_max.exercise` | GET | `/fitnessstats-service/vbt-stats/one-rep-max/{exerciseType}/current/{date}` | — | — | — | yes (empty) |
| `get_one_rep_max_history` | GET | `/fitnessstats-service/vbt-stats/one-rep-max/{exerciseType}/{aggregation}` | — | — | — | no |
| `get_fitness_age_details` | GET | `/fitnessage-service/fitnessage/v2/{date}` | — | — | — | yes |
| `get_fitness_age_daily` | GET | `/fitnessage-service/stats/daily/{start}/{end}` | — | — | — | yes |
| `get_fitness_age_weekly` | GET | `/fitnessage-service/stats/weekly/{end}/{weeks}` | — | — | — | yes |
| `get_spo2_acclimation_data` | GET | `/wellness-service/wellness/daily/spo2acclimation/{date}` | — | — | — | yes |
| `get_acclimation_stats` | GET | `/wellness-service/stats/daily/acclimation` | — | — | — | yes |

### Weight, body composition, and blood pressure (21)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_stats_and_body` | GET | `/usersummary-service/usersummary/daily/{displayName}` | — | — | — | not documented |
| `get_body_composition` | GET | `/weight-service/weight/dateRange` | — | — | — | not documented |
| `add_body_composition` | POST | `/upload-service/upload` | yes | — | — | not documented |
| `add_weigh_in` | POST | `/weight-service/user-weight` | yes | — | — | not documented |
| `add_weigh_in_with_timestamps` | POST | `/weight-service/user-weight` | yes | — | — | not documented |
| `get_weigh_ins` | GET | `/weight-service/weight/range/{start}/{end}` | — | — | — | not documented |
| `get_daily_weigh_ins` | GET | `/weight-service/weight/dayview/{date}` | — | — | — | not documented |
| `delete_weigh_in` | DELETE | `/weight-service/weight/{date}/byversion/{weightPk}` | yes | yes | — | not documented |
| `delete_weigh_ins` | DELETE | `/weight-service/weight/{date}/byversion/{weightPk}` | yes | yes | — | not documented |
| `set_blood_pressure` | POST | `/bloodpressure-service/bloodpressure` | yes | — | — | not documented |
| `update_blood_pressure` | PUT | `/bloodpressure-service/bloodpressure` | yes | — | — | yes |
| `get_blood_pressure` | GET | `/bloodpressure-service/bloodpressure/range/{start}/{end}` | — | — | — | not documented |
| `delete_blood_pressure` | DELETE | `/bloodpressure-service/bloodpressure/{date}/{version}` | yes | yes | — | not documented |
| `get_latest_weight` | GET | `/weight-service/weight/latest` | — | — | — | yes |
| `get_first_weight` | GET | `/weight-service/weight/first` | — | — | — | yes |
| `get_daily_last_weight` | GET | `/weight-service/weight/daily/last` | — | — | — | yes |
| `get_weight_snapshot` | GET | `/weight-service/weight/daterangesnapshot` | — | — | — | yes |
| `get_weekly_weight` | GET | `/weight-service/weight/weeklyRange/{start}/{end}` | — | — | — | yes |
| `get_blood_pressure_day` | GET | `/bloodpressure-service/bloodpressure/dayview/{date}` | — | — | — | yes (empty) |
| `get_daily_last_blood_pressure` | GET | `/bloodpressure-service/bloodpressure/daily/last/{start}/{end}` | — | — | — | yes (empty) |
| `get_weekly_blood_pressure` | GET | `/bloodpressure-service/bloodpressure/weeklyRange/{start}/{end}` | — | — | — | yes (empty) |

### Achievements, goals, badges, and challenges (27)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_personal_record` | GET | `/personalrecord-service/personalrecord/prs/{displayName}` | — | — | — | yes |
| `get_earned_badges` | GET | `/badge-service/badge/earned` | — | — | — | not documented |
| `get_available_badges` | GET | `/badge-service/badge/available` | — | — | — | not documented |
| `get_in_progress_badges` | GET | `/badge-service/badge/earned` | — | — | — | not documented |
| `get_adhoc_challenges` | GET | `/adhocchallenge-service/adHocChallenge/historical` | — | — | — | not documented |
| `get_badge_challenges` | GET | `/badgechallenge-service/badgeChallenge/completed` | — | — | — | not documented |
| `get_available_badge_challenges` | GET | `/badgechallenge-service/badgeChallenge/available` | — | — | — | not documented |
| `get_non_completed_badge_challenges` | GET | `/badgechallenge-service/badgeChallenge/non-completed` | — | — | — | not documented |
| `get_inprogress_virtual_challenges` | GET | `/badgechallenge-service/virtualChallenge/inProgress` | — | — | — | not documented |
| `get_goals` | GET | `/goal-service/goal/goals` | — | — | — | not documented |
| `get_personal_record_candidates` | GET | `/personalrecord-service/personalrecordcandidate/{displayName}` | — | — | — | yes |
| `get_personal_record_types` | GET | `/personalrecord-service/personalrecordtype/prtypes/{displayName}` | — | — | — | yes |
| `get_personal_records_for_activity` | GET | `/personalrecord-service/personalrecord/prByActivityId/{activityId}` | — | — | — | yes (empty) |
| `get_steps_goal` | GET | `/wellness-service/wellness/wellness-goals/consolidated/steps/{date}` | — | — | — | yes |
| `get_effective_goals` | GET | `/goal-service/goal/user/effective/{date}` | — | — | — | yes |
| `get_user_goals` | GET | `/goal-service/goal/user` | — | — | — | yes |
| `get_weight_goal` | GET | `/goal-service/goal/user/effective/weightgoal/{start}/{end}` | — | — | — | yes (empty) |
| `set_daily_goal` | PUT | `/goal-service/goal/user/effective/{goalType}/{date}` | yes | — | — | yes |
| `get_badge_attributes` | GET | `/badge-service/badge/attributes` | — | — | — | yes |
| `get_badge_detail` | GET | `/badge-service/badge/detail/v3/{badgeId}` | — | — | — | yes |
| `get_latest_earned_badges` | GET | `/badge-service/badge/earned/latest/{displayName}` | — | — | — | yes |
| `get_badges_for_activity` | GET | `/badge-service/badge/{displayName}/earned/activity/{activityId}` | — | — | — | yes (empty) |
| `get_badges_for_day` | GET | `/badge-service/badge/{displayName}/earned/dailysummary/{date}` | — | — | — | yes (empty) |
| `get_available_virtual_challenges` | GET | `/badgechallenge-service/virtualChallenge/available` | — | — | — | yes |
| `get_completed_virtual_challenges` | GET | `/badgechallenge-service/virtualChallenge/completed` | — | — | — | yes (empty) |
| `get_badge_challenge` | GET | `/badgechallenge-service/badgeChallenge/{challengeUuid}` | — | — | — | no |
| `get_active_adhoc_challenges` | GET | `/adhocchallenge-service/adHocChallenge/nonCompleted` | — | — | — | yes (empty) |

### Gear (19)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_gear` | GET | `/gear-service/gear/filterGear` | — | — | — | yes |
| `create_gear` | POST | `/gear-service/gear/v2` | yes | — | — | not documented |
| `get_gear_stats` | GET | `/gear-service/gear/stats/{gearUuid}` | — | — | — | yes |
| `get_gear_defaults` | GET | `/gear-service/gear/user/{userProfileNumber}/activityTypes` | — | — | — | yes |
| `set_gear_default` | PUT | `/gear-service/gear/{gearUuid}/activityType/{activityType}/default/true` | yes | — | — | yes |
| `set_gear_default.remove` | DELETE | `/gear-service/gear/{gearUuid}/activityType/{activityType}` | yes | yes | — | yes |
| `get_activity_gear` | GET | `/gear-service/gear/filterGear` | — | — | — | not documented |
| `get_gear_activities` | GET | `/activitylist-service/activities/{gearUuid}/gear` | — | — | — | yes |
| `add_gear_to_activity` | PUT | `/gear-service/gear/link/{gearUuid}/activity/{activityId}` | yes | — | — | not documented |
| `remove_gear_from_activity` | PUT | `/gear-service/gear/unlink/{gearUuid}/activity/{activityId}` | yes | yes | — | not documented |
| `get_gear_list` | GET | `/gear-service/gear/v2/list` | — | — | — | yes |
| `get_gear_details` | GET | `/gear-service/gear/v2/{gearUuid}` | — | — | — | yes |
| `set_gear_status` | PUT | `/gear-service/gear/v2/{gearUuid}/status/{status}` | yes | — | — | no |
| `update_gear` | PUT | `/gear-service/gear/v2/{gearUuid}` | yes | — | — | yes |
| `delete_gear` | DELETE | `/gear-service/gear/v2/{gearUuid}` | yes | yes | — | yes |
| `get_gear_types` | GET | `/gear-service/gear/types` | — | — | — | yes |
| `get_user_gear_types` | GET | `/gear-service/gear/v2/user-gear-types` | — | — | — | yes |
| `get_gear_make_models` | GET | `/gear-service/gear/makemodels` | — | — | — | yes |
| `get_activity_gear_v2` | GET | `/gear-service/activity/v2/{activityId}` | — | — | — | yes (empty) |

### Devices and sensors (18)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_devices` | GET | `/device-service/deviceregistration/devices` | — | — | — | not documented |
| `get_device_settings` | GET | `/device-service/deviceservice/device-info/settings/{deviceId}` | — | — | — | not documented |
| `get_primary_training_device` | GET | `/web-gateway/device-info/primary-training-device` | — | — | — | not documented |
| `get_device_solar_data` | GET | `/web-gateway/solar/{deviceId}/{start}/{end}` | — | — | — | yes |
| `get_device_alarms` | GET | `/device-service/deviceservice/device-info/settings/{deviceId}` | — | — | — | not documented |
| `get_device_last_used` | GET | `/device-service/deviceservice/mylastused` | — | — | — | not documented |
| `push_workout_to_device` | POST | `/device-service/devicemessage/messages` | yes | — | — | yes |
| `get_all_devices` | GET | `/device-service/deviceregistration/devices/all/{displayName}` | — | — | — | yes |
| `get_historical_devices` | GET | `/device-service/deviceregistration/devices/historical` | — | — | — | yes |
| `get_active_devices` | GET | `/device-service/deviceservice/device-info/active/{displayName}` | — | — | — | yes |
| `get_user_device` | GET | `/device-service/deviceservice/user-device/{deviceId}` | — | — | — | yes |
| `get_device_app_info` | GET | `/device-service/deviceservice/app-info/device/{deviceId}` | — | — | — | yes |
| `get_sensors` | GET | `/device-service/sensors` | — | — | — | yes (empty) |
| `get_device_messages` | GET | `/device-service/devicemessage/messages` | — | — | — | yes |
| `get_device_displayed_activities` | GET | `/devicesettings-service/device/displayed-activities/{deviceId}` | — | — | — | yes (empty) |
| `update_device_settings` | PUT | `/device-service/deviceservice/device-info/settings/{deviceId}` | yes | — | — | no |
| `get_device_solar_gain` | GET | `/device-service/devicemonitoring/solargain/{deviceId}/{start}/{end}` | — | — | — | yes (empty) |
| `send_scheduled_workouts_to_devices` | PUT | `/workout-service/schedule/sendtodevices` | yes | — | — | no |

### Workouts and workout schedule (22)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_workouts` | GET | `/workout-service/workouts` | — | — | — | yes |
| `get_workout_by_id` | GET | `/workout-service/workout/{workoutId}` | — | — | — | not documented |
| `delete_workout` | DELETE | `/workout-service/workout/{workoutId}` | yes | yes | — | not documented |
| `download_workout` | GET | `/workout-service/workout/FIT/{workoutId}` | — | — | yes | not documented |
| `upload_workout` | POST | `/workout-service/workout` | yes | — | — | not documented |
| `update_workout` | PUT | `/workout-service/workout/{workoutId}` | yes | yes | — | not documented |
| `upload_running_workout` | POST | `/workout-service/workout` | yes | — | — | not documented |
| `upload_cycling_workout` | POST | `/workout-service/workout` | yes | — | — | not documented |
| `upload_swimming_workout` | POST | `/workout-service/workout` | yes | — | — | not documented |
| `upload_strength_workout` | POST | `/workout-service/workout` | yes | — | — | not documented |
| `get_scheduled_workouts` | GET | `/calendar-service/year/{year}/month/{month}` | — | — | — | not documented |
| `get_scheduled_workout_by_id` | GET | `/workout-service/schedule/{scheduledWorkoutId}` | — | — | — | not documented |
| `get_next_scheduled_workout` | GET | `/calendar-service/year/{year}/month/{month}` | — | — | — | not documented |
| `schedule_workout` | POST | `/workout-service/schedule/{workoutId}` | yes | — | — | not documented |
| `unschedule_workout` | DELETE | `/workout-service/schedule/{scheduledWorkoutId}` | yes | yes | — | not documented |
| `get_scheduled_workouts_by_period` | GET | `/workout-service/schedule/workoutScheduleByPeriod` | — | — | — | yes (empty) |
| `get_workout_count` | GET | `/workout-service/workouts/count` | — | — | — | yes |
| `get_workout_sport_types` | GET | `/workout-service/workouts/sport-types` | — | — | — | yes |
| `get_workout_types` | GET | `/workout-service/workout/types` | — | — | — | yes |
| `get_strength_benchmarks` | GET | `/workout-service/benchmarks` | — | — | — | yes |
| `copy_workout` | POST | `/workout-service/workout/copy/{workoutId}` | yes | — | — | yes |
| `reschedule_workout` | PUT | `/workout-service/schedule/{scheduledWorkoutId}` | yes | — | — | yes |

### Training plans (8)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_active_training_plans` | GET | `/trainingplan-service/trainingplan/active-plans` | — | — | — | yes (empty) |
| `get_training_plan_tasks` | GET | `/trainingplan-service/trainingplan/tasks/{planId}` | — | — | — | yes |
| `search_training_plans` | POST | `/trainingplan-service/trainingplan/search` | — | — | — | yes |
| `schedule_training_plan` | GET | `/trainingplan-service/trainingplan/schedule/{planId}` | yes | — | — | no |
| `delete_training_plan` | DELETE | `/trainingplan-service/trainingplan/trainingplan/{planId}` | yes | yes | — | no |
| `get_training_plans` | GET | `/trainingplan-service/trainingplan/plans` | — | — | — | yes |
| `get_training_plan_by_id` | GET | `/trainingplan-service/trainingplan/phased/{planId}` | — | — | — | not documented |
| `get_adaptive_training_plan_by_id` | GET | `/trainingplan-service/trainingplan/fbt-adaptive/{planId}` | — | — | — | not documented |

### Calendar (13)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_calendar_year` | GET | `/calendar-service/year/{year}` | — | — | — | yes |
| `get_calendar_week` | GET | `/calendar-service/year/{year}/month/{month}/day/{day}/start/{firstDayOfWeek}` | — | — | — | yes |
| `get_calendar_events` | GET | `/calendar-service/events` | — | — | — | yes |
| `get_upcoming_events` | GET | `/calendar-service/events/upcoming` | — | — | — | yes |
| `get_primary_event` | GET | `/calendar-service/event/primary` | — | — | — | yes |
| `get_calendar_event` | GET | `/calendar-service/event/{eventId}` | — | — | — | yes |
| `create_calendar_event` | POST | `/calendar-service/event` | yes | — | — | no |
| `update_calendar_event` | PUT | `/calendar-service/event/{eventId}` | yes | yes | — | no |
| `delete_calendar_event` | DELETE | `/calendar-service/event/{eventId}` | yes | yes | — | no |
| `move_calendar_item` | PUT | `/calendar-service/calendarItem/{itemType}/{itemId}/date/{date}` | yes | — | — | no |
| `create_calendar_note` | POST | `/calendar-service/note` | yes | — | — | yes |
| `update_calendar_note` | PUT | `/calendar-service/note/{noteId}` | yes | — | — | yes |
| `delete_calendar_note` | DELETE | `/calendar-service/note/{noteId}` | yes | yes | — | yes |

### Courses and PacePro (13)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_courses` | GET | `/course-service/course/owner/{displayName}` | — | — | — | yes (empty) |
| `get_course` | GET | `/course-service/course/{courseId}` | — | — | — | no |
| `create_course` | POST | `/course-service/course` | yes | — | — | no |
| `update_course` | PUT | `/course-service/course/{courseId}` | yes | yes | — | no |
| `delete_course` | DELETE | `/course-service/course/{courseId}` | yes | yes | — | no |
| `download_course` | GET | `/course-service/course/gpx/{courseId}` | — | — | yes | no |
| `download_course.fit` | GET | `/course-service/course/fit/{courseId}/0` | — | — | yes | no |
| `import_course` | POST | `/course-service/course/import` | yes | — | — | no |
| `convert_activity_to_course` | GET | `/course-service/course/convert/activity/{activityId}` | — | — | — | yes |
| `get_course_favorites` | GET | `/course-service/course/favorites` | — | — | — | yes (empty) |
| `set_course_favorite` | POST | `/course-service/course/favorites` | yes | — | — | no |
| `set_course_favorite.remove` | DELETE | `/course-service/course/favorites/course/{courseId}` | yes | yes | — | no |
| `get_pace_bands` | GET | `/course-service/pacebands` | — | — | — | yes (empty) |

### PDF reports (3)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `request_report` | POST | `/reportexport-service/export/init/{category}/{start}/{end}` | yes | — | — | no |
| `get_report_status` | GET | `/reportexport-service/export/reportStatus/{reportId}` | — | — | — | no |
| `download_report` | GET | `/reportexport-service/export/reportContent/{reportId}` | — | — | yes | no |

### Women's health (11)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_menstrual_data_for_date` | GET | `/periodichealth-service/menstrualcycle/dayview/{date}` | — | — | — | not documented |
| `get_menstrual_calendar_data` | GET | `/periodichealth-service/menstrualcycle/calendar/{start}/{end}` | — | — | — | not documented |
| `get_menstrual_last_confirmed` | GET | `/periodichealth-service/menstrualcycle/lastconfirmed/{date}` | — | — | — | not documented |
| `get_menstrual_cycle_summary` | GET | `/periodichealth-service/menstrualcycle/summary/{date}` | — | — | — | not documented |
| `get_menstrual_reports` | GET | `/periodichealth-service/reports/menstrualcycle/{cycles}/{date}` | — | — | — | not documented |
| `get_pregnancy_summary` | GET | `/periodichealth-service/menstrualcycle/pregnancysnapshot` | — | — | — | not documented |
| `update_menstrual_daily_log` | POST | `/periodichealth-service/menstrualcycle/dailylog/{date}` | yes | yes | — | not documented |
| `update_menstrual_calendar` | POST | `/periodichealth-service/menstrualcycle/calendarupdates` | yes | yes | — | not documented |
| `init_menstrual_cycle_setup` | POST | `/periodichealth-service/menstrualcycle/initCycleSetup` | yes | — | — | not documented |
| `confirm_menstrual_period_start` | POST | `/periodichealth-service/menstrualcycle/{date}` | yes | — | — | not documented |
| `update_menstrual_settings` | PUT | `/userprofile-service/userprofile/user-settings` | yes | — | — | not documented |

### Golf (5)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_golf_summary` | GET | `/gcs-golfcommunity/api/v2/scorecard/summary` | — | — | — | not documented |
| `get_golf_scorecard` | GET | `/gcs-golfcommunity/api/v2/scorecard/detail` | — | — | — | not documented |
| `get_golf_shot_data` | GET | `/gcs-golfcommunity/api/v2/shot/scorecard/{scorecardId}/hole` | — | — | — | not documented |
| `get_golf_club_stats` | GET | `/gcs-golfcommunity/api/v2/club/player` | — | — | — | not documented |
| `get_golf_user_stats` | GET | `/gcs-golfcommunity/api/v2/player/stats` | — | — | — | not documented |

### Nutrition (5)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `get_nutrition_status` | GET | `/nutrition-service/user/nutritionCurrentStatus` | — | — | — | yes |
| `get_calorie_summary` | GET | `/nutrition-service/calorie/summary/daily` | — | — | — | yes |
| `get_nutrition_daily_food_log` | GET | `/nutrition-service/food/logs/{date}` | — | — | — | yes |
| `get_nutrition_daily_meals` | GET | `/nutrition-service/meals/{date}` | — | — | — | not documented |
| `get_nutrition_daily_settings` | GET | `/nutrition-service/settings/{date}` | — | — | — | not documented |

### GraphQL gateway (1)

| ID | Method | Path | Write | Destructive | Download | Verified |
|---|---|---|---|---|---|---|
| `query_garmin_graphql` | POST | `/graphql-gateway/graphql` | — | — | — | not documented |

## Runtime handling that cannot be inferred from method and path alone

### Composite and multi-request methods

These public method IDs remain in the catalog for source coverage, but a generic one-request dispatcher is insufficient:

| Method ID | Required orchestration |
|---|---|
| `get_last_activity` | Request `get_activities(0,1)` and handle both list and `activityList` response shapes. |
| `get_activity_images` | Call `get_activity` and extract `metadataDTO.activityImages`; returned S3 URLs expire. |
| `get_in_progress_badges` | Fetch earned and available badges, filter incomplete progress, and merge by `badgeId`. |
| `get_stats_and_body` | Fetch daily stats and body composition, then merge `totalAverage`. Requires `displayName`. |
| `delete_weigh_ins` | Fetch the day, refuse ambiguous multi-sample deletion unless `delete_all=true`, then issue one delete per sample. |
| `get_lactate_threshold` | Latest mode combines two requests; range mode combines speed, heart-rate, and power requests. Use the explicit variants. |
| `get_device_alarms` | List devices, fetch settings for each, and concatenate `alarms`. |
| `push_workout_to_device` | Resolve omitted device/workout IDs, fetch workout name, then build the one-element device-message list. |
| `get_next_scheduled_workout` | Fetch current and next calendar months, filter workout items today or later, and sort. |

Pagination/chunking is also required for `get_goals` and `get_activities_by_date` (bounded pagination), and for `get_daily_steps` and `get_sleep_daily` (28-day chunks). Response-only transformations include morning-readiness selection, resting-HR/calorie series flattening, SpO2 numeric normalization, and documented empty-result handling.

### Method-selected request variants

| Python method | Catalog definitions |
|---|---|
| `download_activity` | `download_activity`, `download_activity.original`, `download_activity.gpx`, `download_activity.kml`, `download_activity.csv` |
| `get_adjacent_activities` | `get_adjacent_activities`, `get_adjacent_activities.next` |
| `get_lactate_threshold` | `get_lactate_threshold`, `get_lactate_threshold.latest-power`, `get_lactate_threshold.range-speed`, `get_lactate_threshold.range-heart-rate`, `get_lactate_threshold.range-power` |
| `get_endurance_score` | `get_endurance_score`, `get_endurance_score.range` |
| `get_race_predictions` | `get_race_predictions`, `get_race_predictions.range` |
| `get_hill_score` | `get_hill_score`, `get_hill_score.range` |
| `get_one_rep_max` | `get_one_rep_max`, `get_one_rep_max.exercise` |
| `get_daily_stats` | `get_daily_stats`, `get_daily_stats.aggregated` |
| `set_gear_default` | `set_gear_default`, `set_gear_default.remove` |
| `download_course` | `download_course`, `download_course.fit` |
| `set_course_favorite` | `set_course_favorite`, `set_course_favorite.remove` |

`request_reload` additionally appends `/{deviceId}` when supplied. `get_device_solar_data` derives `end=start` and `singleDayView=true` for one-day calls. `get_race_predictions` accepts either no range arguments or all three range arguments.

### Body shaping, derived values, and transport

- **Read-merge-write:** `update_user_settings`, `set_steps_goal`, `update_gear`, `reschedule_workout`, and `update_menstrual_settings` fetch current state before constructing the write. `update_gear` also fetches the final object; partial gear bodies are rejected.
- **Nested/custom JSON:** activity updates, simple manual activity creation, daily goals, weigh-ins, blood pressure, hydration, jet-lag trips, gear creation/update, workout replacement, device-message push, calendar item moves, report options, and menstrual writes all have body instructions in `bodyDescription`/`notes`. Unit conversions and required IDs/timestamps must be applied before sending.
- **Replace-all caution:** `set_activity_exercise_sets`, `update_workout`, `update_jetlag_trip`, `update_calendar_event`, `update_course`, `update_menstrual_daily_log`, and `update_menstrual_calendar` can discard omitted prior state. Menstrual daily-log list/scalar clearing and note-preservation rules are especially important.
- **Multipart:** `upload_activity`, `import_activity`, and `import_course` stream a caller-supplied file. `add_body_composition` first generates FIT bytes. `import_activity` also requires the documented mobile headers and duplicate handling.
- **Other media types:** `copy_workout` sends only the new name as UTF-8 `text/plain`; `search_training_plans` sends an empty URL-encoded form body while filters remain query parameters.
- **Derived paths:** weekly weight and blood-pressure ranges require `start=end-363 days`; calendar week and scheduled-workout month paths use zero-based months; daily-goal path slugs differ from the body's goal type.
- **Display name:** every path containing `{displayName}` requires the authenticated Garmin display name, resolved and encoded by the runtime. It is not optional free text.
- **Golf holes:** `get_golf_shot_data` normalizes comma separators and must omit the hole filter whenever holes 10–18 are requested, because Garmin drops those double-digit filters.

### Binary responses

The 11 definitions marked `download=yes` must bypass JSON decoding and expose bytes plus an appropriate filename/media type at a higher layer:

- **Activities:** `download_activity`, `download_activity.original`, `download_activity.gpx`, `download_activity.kml`, `download_activity.csv`.
- **Health and wellness:** `download_health_snapshot`, `download_health_snapshot_session`.
- **Workouts and workout schedule:** `download_workout`.
- **Courses and PacePro:** `download_course`, `download_course.fit`.
- **PDF reports:** `download_report`.

## GraphQL gateway operations

All documented dashboard operations use the single `query_garmin_graphql` definition: `POST /graphql-gateway/graphql` with the request object forwarded unchanged. The observed web requests are anonymous `query` operations with arguments inlined as literals; the reference documents no mutations, fragments, variables requirement, or persisted queries. Dates are `YYYY-MM-DD`; local Connect timestamps are `YYYY-MM-DDTHH:mm:ss.SSS`.

Most `*Scalar` fields return opaque JSON and take no selection set. The eight plain fields marked **required** below need the exact selection sets from the reference `docs/graphql_operations.md`; treating them as scalars will fail.

| Root field(s) | Arguments | Selection set |
|---|---|---|
| `activitiesScalar` | displayName, startTimestampLocal, endTimestampLocal, limit | scalar |
| `activityStatsScalar` | aggregation, startDate, endDate, metrics[], groupByParentActivityType, standardizedUnits, optional activityType[] | scalar |
| `activityTrendsScalar` | activityType, date | scalar |
| `adhocChallengePendingInviteScalar, adhocChallengesScalar, badgeChallengesScalar, expeditionsChallengesScalar` | none | scalar |
| `bloodPressureScalar` | startDate, endDate | scalar |
| `calorieSummaryDailyStats` | startDate, endDate, currentDate | required |
| `criticalSwimSpeedScalar` | startDate, endDate | scalar |
| `cyclingAbility` | startDate, endDate | required |
| `dailyEventsScalar` | date | scalar |
| `enduranceScoreScalar` | startDate, endDate, aggregation | scalar |
| `epochChartScalar` | date, include[] (steps, pushes, stress, bodyBattery) | scalar |
| `functionalThresholdPowerScalar` | startDate, endDate, sports | scalar |
| `golfScorecardScalar` | startTimestampLocal, endTimestampLocal | scalar |
| `healthSnapshotScalar` | startDate, endDate | scalar |
| `healthStatusSummary` | calendarDate | required |
| `heartRateScalar` | date | scalar |
| `heartRateVariabilityScalar` | startDate, endDate | scalar |
| `heatAltitudeAcclimationScalar` | date | scalar |
| `hillScoreScalar` | startDate, endDate, aggregation | scalar |
| `jetLagScalar` | date | scalar |
| `latestFitnessAgeScalar` | asOfDate | scalar |
| `latestWeightScalar` | asOfDate | scalar |
| `lifestyleLoggingStats` | startDate, endDate | required |
| `menstrualCycleScalar` | date | scalar |
| `menstrualCycleDetail` | date, todayDate | required |
| `myDayCardEventsScalar` | timeZone=GMT, date | scalar |
| `pendingActivities` | none | required |
| `personalRecordsScalar` | none | scalar |
| `powerToWeightScalar` | date, sports | scalar |
| `pregnancyScalar` | date | scalar |
| `runningEconomy` | startDate, endDate | required |
| `runningLactateThresholdScalar` | none | scalar |
| `runningToleranceStats` | startDate, endDate, aggregation=daily (unquoted enum) | required |
| `searchActivitiesScalar` | start, limit, excludedActivitySubTypes[] | scalar |
| `sleepScalar` | date, sleepOnly | scalar |
| `sleepSummariesScalar` | startDate, endDate | scalar |
| `spO2AcclimationScalar` | date | scalar |
| `trainingLoadBalanceScalar` | calendarDate, fullHistoryScan=true | scalar |
| `trainingPlanScalar` | calendarDate, lang, firstDayOfWeek | scalar |
| `trainingReadinessRangeScalar` | startDate, endDate | scalar |
| `trainingStatusDailyScalar` | calendarDate | scalar |
| `trainingStatusWeeklyScalar` | startDate, endDate, displayName | scalar |
| `userDailySummaryV2Scalar, userDailySummaryV2AverageScalar` | startDate, endDate | scalar |
| `userGoalsScalar` | none | scalar |
| `vo2MaxScalar` | startDate, endDate, optional sport | scalar |
| `weightScalar` | startDate, endDate | scalar |
| `workoutScheduleSummariesScalar` | startDate, endDate | scalar |

The separate `/gateway/graph-atp/graphql` Garmin Coach endpoint (`Coaches`, `Videos`, `Articles`) is explicitly outside the reference library and this catalog.

## Known gaps and stability limits

The reference deliberately does **not** implement the following web-app areas, so this catalog does not invent arbitrary endpoints for them:

- Social graph and feed actions: comments, likes, image flags, connections/followers, groups, leaderboards, inbox/newsfeed, and ad-hoc challenge invitation writes. Read-only GraphQL challenge-card fields listed above do not add those missing REST writes.
- Account/admin integrations: profile-image upload, Office 365 calendar sync, Fitbit import, dashboard layout (`userfocus-service`), and UI preferences (`userpreference-service`).
- Specialized dive, additional golf, and animal/dog endpoints beyond the explicit golf methods cataloged here.
- Index scale setup (`weightscale-service`).
- Nutrition food search, favorites, recipes, and custom-food writes; only the reference's read endpoints are included.
- `/metrics-service/metrics/eventracetimeprojections/{eventId}/{d1}/{d2}` (unclear date semantics) and internal `manualstresslevel`.
- Garmin Coach GraphQL (`/gateway/graph-atp/graphql`) as noted above.

Garmin Connect is a private, undocumented API. Paths, request shapes, regional behavior, and availability can change without notice, and **permanent coverage is not guaranteed**. Verification is a historical snapshot from the cited reference, not a compatibility promise. Authentication, token lifecycle, error/rate-limit handling, and live contract tests must be maintained separately.

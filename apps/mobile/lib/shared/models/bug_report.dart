import 'common.dart';

/// A user-submitted bug report. Mirrors `BugReport` in the web/API types.
class BugReport {
  const BugReport({
    required this.id,
    required this.title,
    required this.description,
    required this.severity,
    required this.status,
    required this.area,
    required this.appVersion,
    required this.platform,
    required this.createdAt,
    required this.updatedAt,
  });

  final Uuid id;
  final String title;
  final String description;

  /// `LOW` | `MEDIUM` | `HIGH` | `CRITICAL` — picked by the reporter.
  final String severity;

  /// `OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED` — owned by the server.
  final String status;

  final String? area;
  final String? appVersion;
  final String? platform;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;

  factory BugReport.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return BugReport(
      id: map['id']! as String,
      title: map['title']! as String,
      description: map['description']! as String,
      severity: map['severity']! as String,
      status: map['status']! as String,
      area: map['area'] as String?,
      appVersion: map['appVersion'] as String?,
      platform: map['platform'] as String?,
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
    );
  }
}

/// Severities a reporter may choose, ascending by how much it hurts.
const List<String> bugReportSeverities = <String>[
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

/// Display label for a raw severity value.
String bugReportSeverityLabel(String severity) => switch (severity) {
      'LOW' => 'Low',
      'HIGH' => 'High',
      'CRITICAL' => 'Critical',
      _ => 'Medium',
    };

/// Display label for a raw triage status value.
String bugReportStatusLabel(String status) => switch (status) {
      'IN_PROGRESS' => 'In progress',
      'RESOLVED' => 'Resolved',
      'CLOSED' => 'Closed',
      _ => 'Open',
    };

/// Create payload — the client never sends a triage `status`.
class BugReportInput {
  const BugReportInput({
    required this.title,
    required this.description,
    required this.severity,
    this.area,
    this.appVersion,
    this.platform,
  });

  final String title;
  final String description;
  final String severity;
  final String? area;
  final String? appVersion;
  final String? platform;

  Map<String, Object?> toJson() => {
        'title': title,
        'description': description,
        'severity': severity,
        'area': area,
        'appVersion': appVersion,
        'platform': platform,
      };
}

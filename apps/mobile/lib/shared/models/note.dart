import 'common.dart';

/// A transaction a note is tagged on — just enough to render a chip.
class NoteTransactionRef {
  const NoteTransactionRef({
    required this.id,
    required this.title,
    required this.transactionDate,
  });

  final Uuid id;
  final String title;

  /// Calendar day, `YYYY-MM-DD`, in the owner's timezone.
  final IsoDate transactionDate;

  factory NoteTransactionRef.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return NoteTransactionRef(
      id: map['id']! as String,
      title: map['title']! as String,
      transactionDate: map['transactionDate']! as String,
    );
  }
}

/// A private note, optionally tagged on any number of transactions (the link
/// lives on `Transaction.noteId`). Mirrors `Note` in the web/API types.
class Note {
  const Note({
    required this.id,
    required this.title,
    required this.content,
    required this.transactions,
    required this.createdAt,
    required this.updatedAt,
  });

  final Uuid id;
  final String title;
  final String? content;

  /// Live transactions this note is tagged on, newest first.
  final List<NoteTransactionRef> transactions;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;

  factory Note.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return Note(
      id: map['id']! as String,
      title: map['title']! as String,
      content: map['content'] as String?,
      transactions: ((map['transactions'] as List<Object?>?) ?? const [])
          .map(NoteTransactionRef.fromJson)
          .toList(),
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
    );
  }
}

/// Create payload — `transactionIds` replaces the whole tag set.
class NoteInput {
  const NoteInput({
    required this.title,
    required this.transactionIds,
    this.content,
  });

  final String title;
  final String? content;
  final List<Uuid> transactionIds;

  Map<String, Object?> toJson() => {
        'title': title,
        'content': content,
        'transactionIds': transactionIds,
      };
}

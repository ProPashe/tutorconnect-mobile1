import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// All calls that mutate financial state or business logic go through
/// the Express backend so that:
/// - Bid fees are correctly deducted server-side
/// - Escrow is created atomically
/// - Payments are idempotent (webhook double-fire safe)
class ApiService {
  /// Base URL of the Express server.
  /// Override via BACKEND_URL in .env (e.g. your ngrok/prod URL).
  static String get _base =>
      dotenv.env['BACKEND_URL'] ?? 'http://10.0.2.2:3000';

  // ── helpers ────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final uri = Uri.parse('$_base$path');
    final session = Supabase.instance.client.auth.currentSession;
    final headers = {
      'Content-Type': 'application/json',
      if (session != null) 'Authorization': 'Bearer ${session.accessToken}',
    };

    final response = await http
        .post(
          uri,
          headers: headers,
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 30));

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode != 200) {
      String errorMessage = data['error'] ?? 'Unknown server error';
      if (data['details'] != null) {
        errorMessage += ': ${data['details']}';
      }
      throw ApiException(errorMessage);
    }
    return data;
  }

  static Future<Map<String, dynamic>> _get(String path) async {
    final uri = Uri.parse('$_base$path');
    final session = Supabase.instance.client.auth.currentSession;
    final headers = {
      if (session != null) 'Authorization': 'Bearer ${session.accessToken}',
    };

    final response = await http
        .get(uri, headers: headers)
        .timeout(const Duration(seconds: 30));

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode != 200) {
      String errorMessage = data['error'] ?? 'Unknown server error';
      if (data['details'] != null) {
        errorMessage += ': ${data['details']}';
      }
      throw ApiException(errorMessage);
    }
    return data;
  }

  // ── Bid operations ─────────────────────────────────────────────────────────

  /// Places a bid. Deducts $0.50 bid fee from the tutor's wallet
  /// (or uses a free bid if available) server-side.
  static Future<void> placeBid({
    required String tutorId,
    required String requestId,
    required double amount,
    required String message,
  }) async {
    await _post('/api/bids/place', {
      'tutorId': tutorId,
      'requestId': requestId,
      'amount': amount,
      'message': message,
    });
  }

  /// Accepts a bid using the student's wallet balance.
  /// Creates escrow atomically server-side.
  static Future<void> acceptBid({
    required String studentId,
    required String bidId,
  }) async {
    await _post('/api/bids/accept', {
      'studentId': studentId,
      'bidId': bidId,
    });
  }

  // ── Payment (Paynow) ────────────────────────────────────────────────────────

  /// Initiates a Paynow top-up via the backend.
  /// Returns the redirect URL to launch in the browser and a pollUrl for status.
  static Future<({String redirectUrl, String pollUrl})> initiateTopUp({
    required String userId,
    required double amount,
    required String email,
  }) async {
    final data = await _post('/api/wallet/initiate-topup', {
      'userId': userId,
      'amount': amount,
      'email': email,
    });

    return (
      redirectUrl: data['redirectUrl'] as String,
      pollUrl: data['pollUrl'] as String? ?? '',
    );
  }

  /// Initiates a Paynow payment for a bid (direct pay, bypasses wallet).
  static Future<({String redirectUrl, String pollUrl})> initiatePaynowBid({
    required String bidId,
    required String studentId,
    required String email,
  }) async {
    final data = await _post('/api/payments/initiate-paynow', {
      'bidId': bidId,
      'studentId': studentId,
      'email': email,
    });

    return (
      redirectUrl: data['redirectUrl'] as String,
      pollUrl: data['pollUrl'] as String? ?? '',
    );
  }

  /// Polls the backend to check payment status using a pollUrl.
  /// The backend proxies the poll to Paynow so the client
  /// never needs direct access to the Paynow poll URL.
  static Future<bool> checkPaymentStatus(String pollUrl) async {
    final encodedUrl = Uri.encodeQueryComponent(pollUrl);
    final data = await _get('/api/payments/poll-status?pollUrl=$encodedUrl');
    return data['paid'] == true;
  }

  // ── Lesson lifecycle ────────────────────────────────────────────────────────

  static Future<void> completeLesson({
    required String lessonId,
    required String userId,
  }) async {
    await _post('/api/lessons/complete', {
      'lessonId': lessonId,
      'userId': userId,
    });
  }

  static Future<void> startLesson({
    required String lessonId,
    required String tutorId,
  }) async {
    await _post('/api/lessons/start', {
      'lessonId': lessonId,
      'tutorId': tutorId,
    });
  }

  static Future<void> cancelLesson({
    required String lessonId,
    required String userId,
    String? reason,
  }) async {
    await _post('/api/lessons/cancel', {
      'lessonId': lessonId,
      'userId': userId,
      if (reason != null) 'reason': reason,
    });
  }

  static Future<void> submitDispute({
    required String lessonId,
    required String reason,
    required String details,
  }) async {
    await _post('/api/lessons/dispute', {
      'lessonId': lessonId,
      'reason': reason,
      'details': details,
    });
  }

  static Future<void> updateMeetingLink({
    required String lessonId,
    required String tutorId,
    required String meetingLink,
    required String meetingType,
  }) async {
    await _post('/api/lessons/update-meeting', {
      'lessonId': lessonId,
      'tutorId': tutorId,
      'meetingLink': meetingLink,
      'meetingType': meetingType,
    });
  }

  static Future<void> submitReview({
    required String lessonId,
    required String tutorId,
    required int rating,
    String? reviewText,
  }) async {
    final studentId = Supabase.instance.client.auth.currentUser?.id;
    if (studentId == null) throw Exception('Not logged in');

    await _post('/api/reviews', {
      'lessonId': lessonId,
      'tutorId': tutorId,
      'studentId': studentId,
      'rating': rating,
      if (reviewText != null) 'reviewText': reviewText,
    });
  }

}

/// Typed exception for backend errors so the UI can show the server message.
class ApiException implements Exception {
  final String message;
  const ApiException(this.message);

  @override
  String toString() => message;
}

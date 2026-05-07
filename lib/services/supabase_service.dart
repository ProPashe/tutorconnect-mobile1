import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService extends ChangeNotifier {
  final _supabase = Supabase.instance.client;
  Map<String, dynamic>? _profile;

  Map<String, dynamic>? get profile => _profile;
  User? get currentUser => _supabase.auth.currentUser;

  // Initialize and load user profile
  Future<void> loadProfile() async {
    final user = _supabase.auth.currentUser;
    if (user != null) {
      final data = await _supabase
          .from('profiles')
          .select()
          .eq('id', user.id)
          .single();
      _profile = data;
      notifyListeners();
    }
  }

  // Auth Operations
  Future<void> signIn(String email, String password) async {
    await _supabase.auth.signInWithPassword(email: email, password: password);
    await loadProfile();
  }

  Future<void> signUp(String email, String password, String role, String name) async {
    final res = await _supabase.auth.signUp(email: email, password: password);
    if (res.user != null) {
      await _supabase.from('profiles').insert({
        'id': res.user!.id,
        'email': email,
        'role': role,
        'display_name': name,
        'wallet_balance': 0.0,
      });
    }
    await loadProfile();
  }

  Future<void> signOut() async {
    await _supabase.auth.signOut();
    _profile = null;
    notifyListeners();
  }

  // Lesson Operations
  Stream<List<Map<String, dynamic>>> getOpenRequests() {
    return _supabase
        .from('lesson_requests')
        .stream(primaryKey: ['id'])
        .eq('status', 'open')
        .order('created_at');
  }

  Future<void> postRequest(String subject, String description, double minBudget, double maxBudget, String scheduledDate) async {
    try {
      await _supabase.rpc('post_request_and_pay_fee', params: {
        'p_student_id': currentUser!.id,
        'p_subject': subject,
        'p_description': description,
        'p_budget_min': minBudget,
        'p_budget_max': maxBudget,
        'p_scheduled_date': scheduledDate,
        'p_fee': 0.30,
      });
      await loadProfile(); // Refresh balance
    } catch (e) {
      rethrow;
    }
  }

  // Wallet and Transactions are now handled by the backend.
  // See ApiService in lib/services/api_service.dart
  
  // Get Wallet Transactions (Read-only from Supabase)
  Future<List<Map<String, dynamic>>> getTransactions({int limit = 10, int offset = 0}) async {
    return await _supabase
        .from('transactions')
        .select()
        .eq('user_id', currentUser!.id)
        .order('created_at', ascending: false)
        .range(offset, offset + limit - 1);
  }
}

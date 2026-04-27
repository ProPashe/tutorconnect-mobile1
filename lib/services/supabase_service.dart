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

  Future<void> placeBid(String requestId, double amount, String message) async {
    await _supabase.from('bids').insert({
      'request_id': requestId,
      'tutor_id': currentUser!.id,
      'amount': amount,
      'message': message,
      'status': 'pending',
    });
  }

  // Wallet and Escrow (Calling the SQL Function we created)
  Future<void> acceptBid(String bidId) async {
    try {
      await _supabase.rpc('accept_bid_and_pay', params: {
        'p_bid_id': bidId,
        'p_student_id': currentUser!.id,
      });
      await loadProfile(); // Refresh balance
    } catch (e) {
      rethrow;
    }
  }

  // Get Wallet Transactions
  Future<List<Map<String, dynamic>>> getTransactions() async {
    return await _supabase
        .from('transactions')
        .select()
        .eq('user_id', currentUser!.id)
        .order('created_at', ascending: false);
  }
}

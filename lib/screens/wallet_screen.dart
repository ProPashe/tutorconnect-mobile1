import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import '../services/supabase_service.dart';
import '../services/api_service.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _isPolling = false;
  Timer? _pollingTimer;

  final ScrollController _scrollController = ScrollController();
  List<Map<String, dynamic>> _transactions = [];
  bool _isLoadingInitial = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  static const int _pageSize = 15;

  @override
  void initState() {
    super.initState();
    _fetchTransactions(refresh: true);
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
        _fetchTransactions();
      }
    });
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _fetchTransactions({bool refresh = false}) async {
    if (refresh) {
      setState(() {
        _isLoadingInitial = true;
        _transactions.clear();
        _hasMore = true;
      });
    }

    if (!_hasMore || _isLoadingMore) return;

    if (!refresh) {
      setState(() => _isLoadingMore = true);
    }

    try {
      final service = Provider.of<SupabaseService>(context, listen: false);
      final newTxs = await service.getTransactions(
        limit: _pageSize,
        offset: _transactions.length,
      );

      setState(() {
        _transactions.addAll(newTxs);
        _hasMore = newTxs.length == _pageSize;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load transactions: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingInitial = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  /// Polls the backend (which proxies Paynow) until the payment is confirmed
  /// or the max wait time elapses. The wallet balance is NOT updated here —
  /// the backend webhook handles that. We only refresh the local profile so
  /// the UI reflects the new balance once Firestore/Supabase is updated.
  void _startPolling(String pollUrl) {
    setState(() {
      _isPolling = true;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Waiting for Paynow confirmation…'),
          duration: Duration(seconds: 4),
        ),
      );
    }

    int attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5s intervals

    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (timer) async {
      attempts++;
      if (attempts >= maxAttempts) {
        timer.cancel();
        if (mounted) {
          setState(() => _isPolling = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Payment confirmation timed out. Check your wallet later.'),
            ),
          );
        }
        return;
      }

      try {
        final paid = await ApiService.checkPaymentStatus(pollUrl);
        if (paid) {
          timer.cancel();
          if (!mounted) return;
          setState(() => _isPolling = false);
          // Refresh profile so the UI reflects the updated balance
          // (balance was already credited by the backend webhook).
          await Provider.of<SupabaseService>(context, listen: false)
              .loadProfile();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Payment confirmed! Balance updated.'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (_) {
        // Ignore transient poll errors — keep retrying
      }
    });
  }

  void _showTopUpDialog() {
    final amountController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Top Up Wallet'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Enter amount to top up via Paynow (USD)'),
            const SizedBox(height: 16),
            TextField(
              controller: amountController,
              decoration: const InputDecoration(
                labelText: 'Amount (\$)',
                border: OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: _isPolling
                ? null
                : () async {
                    final amountStr = amountController.text.trim();
                    final amount = double.tryParse(amountStr);
                    if (amount == null || amount <= 0) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('Please enter a valid amount')),
                      );
                      return;
                    }

                    Navigator.pop(ctx);

                    try {
                      final profile =
                          Provider.of<SupabaseService>(context, listen: false)
                              .profile;
                      final email =
                          profile?['email'] ?? 'user@tutorconnect.co.zw';
                      final userId = Provider.of<SupabaseService>(
                        context,
                        listen: false,
                      ).currentUser?.id;

                      if (userId == null) throw Exception('Not logged in');

                      // Initiate via backend — backend creates the attempt doc
                      // and returns the Paynow redirect + poll URLs.
                      final result = await ApiService.initiateTopUp(
                        userId: userId,
                        amount: amount,
                        email: email,
                      );

                      final url = Uri.parse(result.redirectUrl);
                      if (await canLaunchUrl(url)) {
                        await launchUrl(url, mode: LaunchMode.externalApplication);
                        if (result.pollUrl.isNotEmpty) {
                          _startPolling(result.pollUrl);
                        }
                      } else {
                        throw Exception('Could not open payment page');
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Payment failed: $e')),
                        );
                      }
                    }
                  },
            child: const Text('Proceed to Pay'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = Provider.of<SupabaseService>(context).profile;
    final service = Provider.of<SupabaseService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(title: const Text('My Wallet')),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary,
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(32),
                bottomRight: Radius.circular(32),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Current Balance',
                  style: TextStyle(color: Colors.white70, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Text(
                  '\$${(profile?['wallet_balance'] ?? 0.0).toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 40,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _isPolling ? null : _showTopUpDialog,
                  icon: _isPolling 
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(LucideIcons.plus),
                  label: Text(_isPolling ? 'Confirming Payment...' : 'Top Up with Paynow'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Theme.of(context).colorScheme.primary,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _isLoadingInitial
                ? const Center(child: CircularProgressIndicator())
                : _transactions.isEmpty
                    ? const Center(child: Text('No transactions yet.'))
                    : RefreshIndicator(
                        onRefresh: () => _fetchTransactions(refresh: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: _transactions.length + (_hasMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == _transactions.length) {
                              return const Padding(
                                padding: EdgeInsets.all(16.0),
                                child: Center(child: CircularProgressIndicator()),
                              );
                            }

                            final tx = _transactions[index];
                            final isNegative = tx['amount'] < 0;

                            return ListTile(
                              leading: CircleAvatar(
                                backgroundColor: isNegative ? Colors.red.withValues(alpha: 0.1) : Colors.green.withValues(alpha: 0.1),
                                child: Icon(
                                  isNegative ? LucideIcons.arrowUpRight : LucideIcons.arrowDownLeft,
                                  color: isNegative ? Colors.red : Colors.green,
                                  size: 20,
                                ),
                              ),
                              title: Text(tx['type'].toString().toUpperCase().replaceAll('_', ' ')),
                              subtitle: Text(DateFormat('MMM d, HH:mm').format(DateTime.parse(tx['created_at']))),
                              trailing: Text(
                                '${isNegative ? '-' : '+'}\$${tx['amount'].abs().toStringAsFixed(2)}',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: isNegative ? Colors.red : Colors.green,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

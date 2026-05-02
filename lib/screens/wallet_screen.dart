import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  void _showTopUpDialog() {
    final amountController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Top Up Wallet'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Enter amount to top up via Paynow (ZWL/USD)'),
            const SizedBox(height: 16),
            TextField(
              controller: amountController,
              decoration: const InputDecoration(
                labelText: 'Amount (\$)',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final amountStr = amountController.text.trim();
              if (amountStr.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please enter an amount')),
                );
                return;
              }
              final amount = double.tryParse(amountStr);
              if (amount == null || amount <= 0) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please enter a valid amount')),
                );
                return;
              }

              // Mock Paynow processing
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Processing payment via Paynow...')),
              );
              
              try {
                await Provider.of<SupabaseService>(context, listen: false).topUpWallet(amount);
                if (context.mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Successfully topped up \$${amount.toStringAsFixed(2)}')),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to top up: $e')),
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
                  onPressed: _showTopUpDialog,
                  icon: const Icon(LucideIcons.plus),
                  label: const Text('Top Up with Paynow'),
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
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: service.getTransactions(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return const Center(child: Text('No transactions yet.'));
                }

                final txs = snapshot.data!;
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: txs.length,
                  itemBuilder: (context, index) {
                    final tx = txs[index];
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
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

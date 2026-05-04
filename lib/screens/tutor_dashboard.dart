import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/supabase_service.dart';
import 'wallet_screen.dart';

class TutorDashboard extends StatelessWidget {
  const TutorDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = Provider.of<SupabaseService>(context).profile;
    final service = Provider.of<SupabaseService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tutor Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.wallet),
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const WalletScreen())),
          ),
          IconButton(
            icon: const Icon(LucideIcons.logOut),
            onPressed: () => service.signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Tutor Banner
          Container(
            padding: const EdgeInsets.all(24),
            color: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.1),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: Theme.of(context).colorScheme.secondary,
                  child: const Icon(LucideIcons.user,
                      color: Colors.white, size: 32),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome, ${profile?['display_name'] ?? 'Tutor'}',
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const Text('Ready to help someone learn?'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: Row(
              children: [
                Icon(LucideIcons.search, size: 18),
                SizedBox(width: 8),
                Text('Available Requests',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Expanded(
            child: StreamBuilder<List<Map<String, dynamic>>>(
              stream: service.getOpenRequests(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(LucideIcons.clipboardList,
                            size: 48, color: Colors.grey[300]),
                        const SizedBox(height: 16),
                        const Text('No open requests right now.',
                            style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                  );
                }

                final requests = snapshot.data!;
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: requests.length,
                  itemBuilder: (context, index) {
                    final req = requests[index];
                    return Card(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Colors.grey[200]!),
                      ),
                      margin: const EdgeInsets.only(bottom: 12),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  req['subject'],
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.green[50],
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    '\$${req['budget_min']} - \$${req['budget_max']}',
                                    style: TextStyle(
                                        color: Colors.green[700],
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              req['description'],
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: () =>
                                    _showBidDialog(context, req['id']),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor:
                                      Theme.of(context).colorScheme.primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                child: const Text('Place a Bid'),
                              ),
                            ),
                          ],
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

  void _showBidDialog(BuildContext context, String requestId) {
    final amountController = TextEditingController();
    final messageController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Place your Bid'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountController,
              decoration: const InputDecoration(labelText: 'Amount (\$)'),
              keyboardType: TextInputType.number,
            ),
            TextField(
              controller: messageController,
              decoration:
                  const InputDecoration(labelText: 'Message to student'),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Provider.of<SupabaseService>(context, listen: false).placeBid(
                requestId,
                double.parse(amountController.text),
                messageController.text,
              );
              Navigator.pop(context);
            },
            child: const Text('Submit Bid'),
          ),
        ],
      ),
    );
  }
}

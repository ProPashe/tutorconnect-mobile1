import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../animations/fade_in.dart';
import 'post_request_screen.dart';
import 'notifications_screen.dart';

class StudentDashboard extends StatelessWidget {
  const StudentDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = Provider.of<SupabaseService>(context).profile;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await Provider.of<SupabaseService>(context, listen: false).loadProfile();
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context, profile),
                const SizedBox(height: 32),
                FadeIn(
                  delay: 0.2,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Your Requests',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      TextButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const PostRequestScreen()),
                          );
                        },
                        icon: const Icon(LucideIcons.plus, size: 18),
                        label: const Text('New'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const FadeIn(
                  delay: 0.3,
                  child: SizedBox(
                    height: 450,
                    child: LessonRequestsList(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, Map<String, dynamic>? profile) {
    final name = profile?['display_name'] ?? 'Student';
    final balance = (profile?['wallet_balance'] ?? 0.0) as num;
    return FadeIn(
      delay: 0.1,
      child: GlassCard(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 30,
              backgroundColor: AppColors.primaryLight.withValues(alpha: 0.2),
              child: const Icon(LucideIcons.user, color: AppColors.primary, size: 30),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Good Morning,',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    name,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: AppColors.primaryDark,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Wallet: \$${balance.toStringAsFixed(2)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.secondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(LucideIcons.bell, color: AppColors.textSecondary),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                );
              },
            ),
            IconButton(
              icon: const Icon(LucideIcons.logOut, color: AppColors.textSecondary),
              onPressed: () {
                Provider.of<SupabaseService>(context, listen: false).signOut();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class LessonRequestsList extends StatelessWidget {
  const LessonRequestsList({super.key});

  @override
  Widget build(BuildContext context) {
    final authService = Provider.of<SupabaseService>(context, listen: false);
    final userId = authService.currentUser?.id;

    if (userId == null) return const Center(child: Text('Not logged in'));

    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: Supabase.instance.client
          .from('lesson_requests')
          .stream(primaryKey: ['id'])
          .eq('student_id', userId)
          .order('created_at', ascending: false),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final requests = snapshot.data;

        if (requests == null || requests.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(LucideIcons.inbox, size: 48, color: AppColors.textSecondary.withValues(alpha: 0.5)),
                const SizedBox(height: 16),
                Text(
                  'No requests yet',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Tap + New to post your first tutoring request',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          physics: const NeverScrollableScrollPhysics(),
          itemCount: requests.length,
          itemBuilder: (context, index) {
            final request = requests[index];
            final status = request['status'] as String? ?? 'open';
            final budgetMin = request['budget_min'];
            final budgetMax = request['budget_max'];
            final budgetText = (budgetMin != null && budgetMax != null)
                ? '\$${budgetMin.toStringAsFixed(0)} – \$${budgetMax.toStringAsFixed(0)}'
                : 'N/A';

            return Padding(
              padding: const EdgeInsets.only(bottom: 12.0),
              child: GlassCard(
                padding: const EdgeInsets.all(0),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  title: Text(
                    request['subject'] ?? 'Unknown Subject',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          _StatusChip(status: status),
                          const SizedBox(width: 8),
                          Text(
                            budgetText,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  trailing: status == 'open'
                      ? const Icon(LucideIcons.chevronRight, color: AppColors.textSecondary)
                      : null,
                  onTap: status == 'open'
                      ? () => _showBidsSheet(context, request)
                      : null,
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showBidsSheet(BuildContext context, Map<String, dynamic> request) {
    final studentId = Supabase.instance.client.auth.currentUser?.id;
    if (studentId == null) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        builder: (_, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bids for "${request['subject']}"',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Tap a bid to accept — funds are held in escrow.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: Supabase.instance.client
                      .from('bids')
                      .select('*, profiles!tutor_id(display_name, bio)')
                      .eq('request_id', request['id'])
                      .eq('status', 'pending')
                      .order('amount'),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final bids = snapshot.data ?? [];
                    if (bids.isEmpty) {
                      return const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.clock, size: 40, color: Colors.grey),
                            SizedBox(height: 12),
                            Text('No bids yet. Check back soon!',
                                style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      );
                    }
                    return ListView.builder(
                      controller: scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: bids.length,
                      itemBuilder: (context, i) {
                        final bid = bids[i];
                        final tutorName = bid['profiles']?['display_name'] ?? 'Tutor';
                        final tutorBio = bid['profiles']?['bio'] ?? '';
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 18,
                                      backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                                      child: Text(
                                        tutorName.isNotEmpty ? tutorName[0].toUpperCase() : 'T',
                                        style: const TextStyle(
                                            color: AppColors.primary,
                                            fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(tutorName,
                                              style: const TextStyle(fontWeight: FontWeight.bold)),
                                          if (tutorBio.isNotEmpty)
                                            Text(
                                              tutorBio,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontSize: 12, color: Colors.grey),
                                            ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: Colors.green[50],
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(color: Colors.green[200]!),
                                      ),
                                      child: Text(
                                        '\$${(bid['amount'] as num).toStringAsFixed(2)}',
                                        style: TextStyle(
                                          color: Colors.green[700],
                                          fontWeight: FontWeight.bold,
                                          fontSize: 15,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (bid['message'] != null && bid['message'].isNotEmpty) ...[
                                  const SizedBox(height: 10),
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: Colors.grey[50],
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      bid['message'],
                                      style: const TextStyle(fontSize: 13),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 12),
                                const SizedBox(height: 12),
                                StatefulBuilder(
                                  builder: (context, setState) {
                                    bool isAccepting = false;
                                    return SizedBox(
                                      width: double.infinity,
                                      child: ElevatedButton.icon(
                                        icon: isAccepting 
                                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                            : const Icon(LucideIcons.checkCircle, size: 18),
                                        label: Text(isAccepting ? 'Accepting...' : 'Accept Bid (Pay from Wallet)'),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: AppColors.primary,
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                              borderRadius: BorderRadius.circular(8)),
                                        ),
                                        onPressed: isAccepting ? null : () async {
                                          setState(() => isAccepting = true);
                                          await _acceptBid(context, bid['id'], studentId, bid['amount']);
                                          if (context.mounted) setState(() => isAccepting = false);
                                        },
                                      ),
                                    );
                                  }
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
        ),
      ),
    );
  }

  Future<void> _acceptBid(
      BuildContext context, String bidId, String studentId, dynamic amount) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Acceptance'),
        content: Text(
          '\$${(amount as num).toStringAsFixed(2)} will be held in escrow from your wallet until the lesson is completed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Accept & Pay', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await ApiService.acceptBid(studentId: studentId, bidId: bidId);
      if (!context.mounted) return;
      Navigator.pop(context); // close the bottom sheet
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ Bid accepted! Funds held in escrow.'),
          backgroundColor: Colors.green,
        ),
      );
      await Provider.of<SupabaseService>(context, listen: false).loadProfile();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.message}'), backgroundColor: Colors.red),
      );
    }
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    switch (status) {
      case 'open':
        bg = Colors.green[50]!;
        fg = Colors.green[700]!;
        break;
      case 'accepted':
        bg = Colors.blue[50]!;
        fg = Colors.blue[700]!;
        break;
      case 'completed':
        bg = Colors.grey[100]!;
        fg = Colors.grey[600]!;
        break;
      case 'expired':
        bg = Colors.orange[50]!;
        fg = Colors.orange[700]!;
        break;
      default:
        bg = Colors.grey[100]!;
        fg = Colors.grey[600]!;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(fontSize: 10, color: fg, fontWeight: FontWeight.bold),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  Future<void> _markAsRead(String notificationId) async {
    await Supabase.instance.client
        .from('notifications')
        .update({'is_read': true})
        .eq('id', notificationId);
  }

  Future<void> _markAllAsRead(String userId) async {
    await Supabase.instance.client
        .from('notifications')
        .update({'is_read': true})
        .eq('user_id', userId)
        .eq('is_read', false);
  }

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      return const Scaffold(body: Center(child: Text('Please log in.')));
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        elevation: 0,
        backgroundColor: AppColors.surface,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.checkCheck, color: AppColors.primary),
            tooltip: 'Mark all as read',
            onPressed: () => _markAllAsRead(userId),
          )
        ],
      ),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: supabase
            .from('notifications')
            .stream(primaryKey: ['id'])
            .eq('user_id', userId)
            .order('created_at', ascending: false),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final notifications = snapshot.data;
          if (notifications == null || notifications.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(LucideIcons.bellRing, size: 64, color: AppColors.textSecondary.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  const Text('No notifications yet', style: TextStyle(color: AppColors.textSecondary, fontSize: 16)),
                ],
              ),
            );
          }

          return ListView.separated(
            itemCount: notifications.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final n = notifications[index];
              final isRead = n['is_read'] ?? false;
              final date = DateTime.parse(n['created_at']).toLocal();
              final dateStr = DateFormat('MMM d, h:mm a').format(date);

              return ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                tileColor: isRead ? Colors.transparent : Colors.blue.withValues(alpha: 0.05),
                leading: Stack(
                  children: [
                    CircleAvatar(
                      backgroundColor: isRead ? Colors.grey[200] : AppColors.primary.withValues(alpha: 0.1),
                      child: Icon(
                        _getIconForTitle(n['title']),
                        color: isRead ? Colors.grey[600] : AppColors.primary,
                      ),
                    ),
                    if (!isRead)
                      Positioned(
                        right: 0,
                        top: 0,
                        child: Container(
                          width: 10,
                          height: 10,
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                        ),
                      )
                  ],
                ),
                title: Text(
                  n['title'] ?? 'Notification',
                  style: TextStyle(
                    fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    Text(
                      n['message'] ?? '',
                      style: TextStyle(
                        color: isRead ? AppColors.textSecondary : AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      dateStr,
                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ],
                ),
                onTap: () {
                  if (!isRead) {
                    _markAsRead(n['id']);
                  }
                },
              );
            },
          );
        },
      ),
    );
  }

  IconData _getIconForTitle(String? title) {
    if (title == null) return LucideIcons.bell;
    final t = title.toLowerCase();
    if (t.contains('bid')) return LucideIcons.badgeDollarSign;
    if (t.contains('lesson')) return LucideIcons.bookOpen;
    if (t.contains('review')) return LucideIcons.star;
    if (t.contains('wallet') || t.contains('paid')) return LucideIcons.wallet;
    return LucideIcons.bell;
  }
}

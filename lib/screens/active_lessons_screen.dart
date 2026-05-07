import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../services/api_service.dart';
import 'chat_screen.dart';
import 'reviews_screen.dart';

class ActiveLessonsScreen extends StatelessWidget {
  const ActiveLessonsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      return const Center(child: Text('Please log in.'));
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('My Active Lessons', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        elevation: 0,
        backgroundColor: AppColors.surface,
      ),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: supabase
            .from('lessons')
            .stream(primaryKey: ['id'])
            .eq('student_id', userId)
            .inFilter('status', ['paid_escrow', 'in_progress'])
            .order('created_at', ascending: false),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final lessons = snapshot.data;
          if (lessons == null || lessons.isEmpty) {
            return _buildEmptyState(context);
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: lessons.length,
            itemBuilder: (context, index) {
              return _LessonCard(lesson: lessons[index]);
            },
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.bookOpen, size: 64, color: AppColors.textSecondary.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          const Text('No active lessons', style: TextStyle(color: AppColors.textSecondary, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Accept bids on your requests to start!', style: TextStyle(color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _LessonCard extends StatelessWidget {
  final Map<String, dynamic> lesson;

  const _LessonCard({required this.lesson});

  @override
  Widget build(BuildContext context) {
    final status = lesson['status'];
    final isEscrow = status == 'paid_escrow';
    final isInProgress = status == 'in_progress';

    return GlassCard(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isEscrow ? Colors.orange[50] : Colors.blue[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isEscrow ? Colors.orange[200]! : Colors.blue[200]!),
                ),
                child: Text(
                  isEscrow ? 'AWAITING START' : 'IN PROGRESS',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: isEscrow ? Colors.orange[700] : Colors.blue[700],
                  ),
                ),
              ),
              Text(
                '\$${(lesson['amount'] as num).toStringAsFixed(2)}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.secondary),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Lesson ID: ${lesson['id'].toString().substring(0, 8)}...',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => ChatScreen(roomId: lesson['id'])),
                    );
                  },
                  icon: const Icon(LucideIcons.messageSquare, size: 18),
                  label: const Text('Chat'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: isInProgress ? () => _completeLesson(context, lesson['id'], lesson['tutor_id']) : null,
                  icon: const Icon(LucideIcons.checkCircle, size: 18),
                  label: const Text('Complete'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isInProgress ? AppColors.success : Colors.grey,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          if (isEscrow) ...[
            const SizedBox(height: 8),
            Center(
              child: TextButton.icon(
                onPressed: () => _cancelLesson(context, lesson['id']),
                icon: const Icon(LucideIcons.xCircle, size: 16),
                label: const Text('Cancel Lesson'),
                style: TextButton.styleFrom(foregroundColor: AppColors.error),
              ),
            ),
          ]
        ],
      ),
    );
  }

  Future<void> _completeLesson(BuildContext context, String lessonId, String tutorId) async {
    final studentId = Supabase.instance.client.auth.currentUser?.id;
    if (studentId == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete Lesson?'),
        content: const Text('This will release the escrow funds to the tutor.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirm != true || !context.mounted) return;

    try {
      await ApiService.completeLesson(lessonId: lessonId, userId: studentId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lesson completed! Funds released.'), backgroundColor: AppColors.success),
        );
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => ReviewsScreen(lessonId: lessonId, tutorId: tutorId)),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _cancelLesson(BuildContext context, String lessonId) async {
    final studentId = Supabase.instance.client.auth.currentUser?.id;
    if (studentId == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Lesson?'),
        content: const Text('Are you sure you want to cancel? Your funds will be refunded to your wallet.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Back')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel Lesson'),
          ),
        ],
      ),
    );

    if (confirm != true || !context.mounted) return;

    try {
      await ApiService.cancelLesson(lessonId: lessonId, userId: studentId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lesson cancelled and funds refunded.'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error),
        );
      }
    }
  }
}

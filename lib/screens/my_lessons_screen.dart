import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../services/api_service.dart';
import 'chat_screen.dart';

class MyLessonsScreen extends StatelessWidget {
  const MyLessonsScreen({super.key});

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
            .eq('tutor_id', userId)
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
          const Text('Place bids to get matched with students!', style: TextStyle(color: AppColors.textSecondary)),
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
                  onPressed: isEscrow ? () => _startLesson(context, lesson['id']) : null,
                  icon: const Icon(LucideIcons.playCircle, size: 18),
                  label: Text(isEscrow ? 'Start Lesson' : 'Started'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isEscrow ? AppColors.primary : Colors.grey,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _startLesson(BuildContext context, String lessonId) async {
    final tutorId = Supabase.instance.client.auth.currentUser?.id;
    if (tutorId == null) return;

    try {
      await ApiService.startLesson(lessonId: lessonId, tutorId: tutorId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Lesson started!'), backgroundColor: AppColors.success),
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

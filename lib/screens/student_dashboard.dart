import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';
import '../theme/app_colors.dart';
import '../widgets/glass_card.dart';
import '../animations/fade_in.dart';
import 'post_request_screen.dart';

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
                    height: 400,
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
    final name = profile?['name'] ?? 'Student';
    
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
                ],
              ),
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
              ],
            ),
          );
        }

        return ListView.builder(
          physics: const NeverScrollableScrollPhysics(),
          itemCount: requests.length,
          itemBuilder: (context, index) {
            final request = requests[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12.0),
              child: GlassCard(
                padding: const EdgeInsets.all(0), // Removed default padding for list tile layout
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  title: Text(
                    request['subject'],
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    '${request['status']} • \$${request['budget']}/hr',
                    style: TextStyle(
                      color: request['status'] == 'open' ? AppColors.secondary : AppColors.textSecondary,
                    ),
                  ),
                  trailing: const Icon(LucideIcons.chevronRight, color: AppColors.textSecondary),
                  onTap: () {
                    // Show bids or details
                  },
                ),
              ),
            );
          },
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';
import 'wallet_screen.dart';
import 'post_request_screen.dart';
import 'chat_screen.dart';

class StudentDashboard extends StatelessWidget {
  const StudentDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = Provider.of<SupabaseService>(context).profile;
    final service = Provider.of<SupabaseService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Student Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.wallet),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WalletScreen())),
          ),
          IconButton(
            icon: const Icon(LucideIcons.logOut),
            onPressed: () => service.signOut(),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Welcome Section
            Text(
              'Hello, ${profile?['display_name'] ?? 'Student'}!',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text('What would you like to learn today?'),
            const SizedBox(height: 24),
            
            // Wallet Quick Card
            GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WalletScreen())),
              child: Card(
                color: Theme.of(context).colorScheme.primary,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Wallet Balance', style: TextStyle(color: Colors.white70)),
                          const SizedBox(height: 4),
                          Text(
                            '\$${(profile?['wallet_balance'] ?? 0.0).toStringAsFixed(2)}',
                            style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const Icon(LucideIcons.chevronRight, color: Colors.white),
                    ],
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'My Active Requests',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                TextButton(
                  onPressed: () {}, // Link to all requests
                  child: const Text('See All'),
                ),
              ],
            ),
            const LessonRequestsList(),
            
            const SizedBox(height: 24),
            Text(
              'My Lessons',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            const LessonsList(),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PostRequestScreen())),
        label: const Text('Post Request'),
        icon: const Icon(LucideIcons.plus),
      ),
    );
  }
}

class LessonRequestsList extends StatelessWidget {
  const LessonRequestsList({super.key});

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: supabase
          .from('lesson_requests')
          .stream(primaryKey: ['id'])
          .eq('student_id', supabase.auth.currentUser!.id)
          .order('created_at', ascending: false),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(20),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Column(
              children: [
                Icon(LucideIcons.search, size: 48, color: Colors.grey),
                SizedBox(height: 16),
                Text('No active requests', style: TextStyle(color: Colors.grey, fontSize: 16)),
              ],
            ),
          );
        }

        final requests = snapshot.data!;
        return Column(
          children: requests.map((req) => Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              title: Text(req['subject'], style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text('Status: ${req['status'].toString().toUpperCase()}'),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () {
                // Show Request Details & Bids
                _showRequestDetails(context, req);
              },
            ),
          )).toList(),
        );
      },
    );
  }

  void _showRequestDetails(BuildContext context, Map<String, dynamic> request) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (_, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(request['subject'], style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(request['description'], style: const TextStyle(fontSize: 16, color: Colors.black87)),
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 16),
              const Text('Bids for this Request', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              BidsList(requestId: request['id']),
            ],
          ),
        ),
      ),
    );
  }
}

class LessonsList extends StatelessWidget {
  const LessonsList({super.key});

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: supabase
          .from('lessons')
          .stream(primaryKey: ['id'])
          .eq('student_id', supabase.auth.currentUser!.id)
          .order('created_at', ascending: false),
      builder: (context, snapshot) {
        if (!snapshot.hasData || snapshot.data!.isEmpty) return const Text('No lessons booked yet.');

        final lessons = snapshot.data!;
        return Column(
          children: lessons.map((lesson) => Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(LucideIcons.graduationCap)),
              title: const Text('Ongoing Tutoring'), // We should join with profiles to get tutor name
              subtitle: Text('Status: ${lesson['status']}'),
              trailing: IconButton(
                icon: const Icon(LucideIcons.messageSquare),
                onPressed: () => Navigator.push(
                  context, 
                  MaterialPageRoute(
                    builder: (_) => ChatScreen(
                      lessonId: lesson['id'], 
                      otherUserName: 'Tutor', // In real app, fetch from profile
                    )
                  )
                ),
              ),
            ),
          )).toList(),
        );
      },
    );
  }
}

class BidsList extends StatelessWidget {
  final String requestId;
  const BidsList({super.key, required this.requestId});

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;
    
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: supabase.from('bids').select('*, profiles(display_name)').eq('request_id', requestId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) return const CircularProgressIndicator();
        if (!snapshot.hasData || snapshot.data!.isEmpty) return const Text('No bids yet.');

        final bids = snapshot.data!;
        return Column(
          children: bids.map((bid) => ListTile(
            title: Text(bid['profiles']['display_name']),
            subtitle: Text('\$${bid['amount']} - ${bid['message']}'),
            trailing: bid['status'] == 'pending' 
              ? ElevatedButton(
                  onPressed: () async {
                    try {
                      await Provider.of<SupabaseService>(context, listen: false).acceptBid(bid['id']);
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bid Accepted!')));
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
                    }
                  },
                  child: const Text('Accept'),
                )
              : Text(bid['status'].toString().toUpperCase()),
          )).toList(),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'student_dashboard.dart';
import 'tutor_dashboard.dart';
import 'chat_list_screen.dart';
import 'wallet_screen.dart';
import 'my_lessons_screen.dart';
import 'active_lessons_screen.dart';

class MainLayout extends StatefulWidget {
  final String role; // 'student' or 'tutor'

  const MainLayout({super.key, required this.role});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  int _currentIndex = 0;

  late final List<Widget> _studentScreens;
  late final List<Widget> _tutorScreens;

  @override
  void initState() {
    super.initState();
    
    _studentScreens = [
      const StudentDashboard(),
      // Active lessons for students
      const ActiveLessonsScreen(),
      const ChatListScreen(), 
      const WalletScreen(),
    ];

    _tutorScreens = [
      const TutorDashboard(),
      // My Lessons for tutors
      const MyLessonsScreen(),
      const ChatListScreen(),
      const WalletScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final screens = widget.role == 'tutor' ? _tutorScreens : _studentScreens;

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        items: widget.role == 'tutor'
            ? const [
                BottomNavigationBarItem(icon: Icon(LucideIcons.layoutDashboard), label: 'Dashboard'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.listTodo), label: 'My Lessons'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.messageSquare), label: 'Messages'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.wallet), label: 'Wallet'),
              ]
            : const [
                BottomNavigationBarItem(icon: Icon(LucideIcons.home), label: 'Home'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.playCircle), label: 'Active Lessons'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.messageSquare), label: 'Messages'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.wallet), label: 'Wallet'),
              ],
      ),
    );
  }
}

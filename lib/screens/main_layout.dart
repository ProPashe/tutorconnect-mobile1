import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'student_dashboard.dart';
import 'tutor_dashboard.dart';
import 'chat_screen.dart';
import 'wallet_screen.dart';

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
      // Placeholder for Tutors list
      const Scaffold(body: Center(child: Text('Tutors Directory'))),
      const ChatScreen(roomId: 'placeholder'), // In a real app, this would be a chat list
      const WalletScreen(),
    ];

    _tutorScreens = [
      const TutorDashboard(),
      // Placeholder for Requests
      const Scaffold(body: Center(child: Text('Lesson Requests'))),
      const ChatScreen(roomId: 'placeholder'),
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
                BottomNavigationBarItem(icon: Icon(LucideIcons.listTodo), label: 'Requests'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.messageSquare), label: 'Messages'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.wallet), label: 'Wallet'),
              ]
            : const [
                BottomNavigationBarItem(icon: Icon(LucideIcons.home), label: 'Home'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.search), label: 'Tutors'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.messageSquare), label: 'Messages'),
                BottomNavigationBarItem(icon: Icon(LucideIcons.wallet), label: 'Wallet'),
              ],
      ),
    );
  }
}

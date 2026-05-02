import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'services/supabase_service.dart';
import 'screens/auth_screen.dart';
import 'screens/main_layout.dart';
import 'theme/app_theme.dart';

import 'package:flutter_dotenv/flutter_dotenv.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load environment variables
  await dotenv.load(fileName: ".env");
  
  // Initialize Supabase (Use your own URL and Anon Key here)
  await Supabase.initialize(
    url: 'https://ilagkiizxpxbxzfujtmn.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsYWdraWl6YnB4Ynh6ZnVqdG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjA3NjcsImV4cCI6MjA5MjU5Njc2N30.cF4CB1C-oaOxoA1ki8FBvXOPPb4QAwA88xLHBMoOKHU',
  );

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => SupabaseService()),
      ],
      child: const TutorConnectApp(),
    ),
  );
}

class TutorConnectApp extends StatelessWidget {
  const TutorConnectApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TutorConnect',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    
    if (session == null) {
      return const AuthScreen();
    }
    
    return FutureBuilder(
      future: Provider.of<SupabaseService>(context, listen: false).loadProfile(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        
        final profile = Provider.of<SupabaseService>(context).profile;
        if (profile == null) return const AuthScreen();

        if (profile['role'] == 'tutor') {
          return const MainLayout(role: 'tutor');
        } else {
          return const MainLayout(role: 'student');
        }
      },
    );
  }
}

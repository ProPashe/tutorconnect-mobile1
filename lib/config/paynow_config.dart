import 'package:flutter_dotenv/flutter_dotenv.dart';

class PaynowConfig {
  static String get integrationId => dotenv.env['PAYNOW_INTEGRATION_ID'] ?? '12345'; 
  static String get integrationKey => dotenv.env['PAYNOW_INTEGRATION_KEY'] ?? 'xxxxx-xxxx-xxxx-xxxx-xxxxx';
  
  // These URLs are used by Paynow to redirect the user and post results.
  static String get returnUrl => dotenv.env['PAYNOW_RETURN_URL'] ?? 'http://localhost:3000/return'; 
  static String get resultUrl => dotenv.env['PAYNOW_RESULT_URL'] ?? 'http://localhost:3000/result'; 
}

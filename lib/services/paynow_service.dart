import 'package:paynow/paynow.dart';
import '../config/paynow_config.dart';

class PaynowService {
  late final Paynow _paynow;

  PaynowService() {
    _paynow = Paynow(
      integrationKey: PaynowConfig.integrationKey,
      integrationId: PaynowConfig.integrationId,
      returnUrl: PaynowConfig.returnUrl,
      resultUrl: PaynowConfig.resultUrl,
    );
  }

  /// Create a new Paynow payment request
  Future<InitResponse> createPayment(double amount, String email) async {
    Payment payment = _paynow.createPayment("Wallet Topup ${DateTime.now().millisecondsSinceEpoch}", email);
    payment.add("Wallet Balance", amount);
    
    InitResponse response = await _paynow.send(payment);
    return response;
  }

  /// Poll Paynow for the status of the transaction using the pollUrl
  Future<StatusResponse> checkPaymentStatus(String pollUrl) async {
    return await _paynow.checkTransactionStatus(pollUrl);
  }
}

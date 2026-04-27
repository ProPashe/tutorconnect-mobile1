{ pkgs, ... }: {
  channel = "stable-23.11";
  packages = [
    pkgs.flutter
    pkgs.jdk17
    pkgs.nodePackages.firebase-tools
  ];
  idx = {
    extensions = [
      "Dart-Code.flutter"
      "Dart-Code.dart-code"
    ];
    workspace = {
      onCreate = {
        # Commands to run when the workspace is created
        flutter-pub-get = "flutter pub get";
      };
      onStart = {
        # Commands to run when the workspace is started
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["flutter" "run" "--machine" "-d" "web-server" "--web-hostname" "0.0.0.0" "--web-port" "3000"];
          manager = "web";
        };
      };
    };
  };
}

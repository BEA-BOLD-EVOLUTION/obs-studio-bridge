#ifndef PayloadRoot
  #error PayloadRoot must be supplied to ISCC.
#endif
#ifndef OutputDir
  #error OutputDir must be supplied to ISCC.
#endif
#ifndef AppVersion
  #define AppVersion "1.3.0"
#endif

[Setup]
AppId={{5D4195E2-1DF8-4EF8-93D9-B04C840E9099}
AppName=OBS Creator Assistant
AppVersion={#AppVersion}
AppPublisher=Bold Evolution
AppPublisherURL=https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge
AppSupportURL=https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge/issues
AppUpdatesURL=https://github.com/BEA-BOLD-EVOLUTION/obs-studio-bridge/releases/latest
DefaultDirName={localappdata}\OBS Creator Assistant
DefaultGroupName=OBS Creator Assistant
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=OBS-Creator-Assistant-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
UninstallDisplayIcon={app}\runtime\node.exe

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#PayloadRoot}\helper\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadRoot}\plugin\obs-creator-assistant.dll"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\bin\64bit"; Flags: ignoreversion
Source: "{#PayloadRoot}\plugin\en-US.ini"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\data\locale"; Flags: ignoreversion
Source: "{#PayloadRoot}\plugin\manifest.json"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\data"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\OBS Creator Assistant"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\Launch-OBS-Creator-Assistant.vbs"""; WorkingDir: "{app}"
Name: "{autodesktop}\OBS Creator Assistant Setup"; Filename: "http://127.0.0.1:8788/"; Tasks: desktopicon

[Run]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""OBS Creator Assistant"" /F"; Flags: runhidden waituntilterminated; StatusMsg: "Upgrading automatic startup..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Initialize-Configuration.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "Detecting OBS and creating secure settings..."
Filename: "{sys}\wscript.exe"; Parameters: """{app}\Launch-OBS-Creator-Assistant.vbs"""; Flags: runhidden nowait; StatusMsg: "Starting OBS Creator Assistant..."
Filename: "http://127.0.0.1:8788/"; Description: "Open OBS Creator Assistant setup"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Stop-OBS-Creator-Assistant.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopAssistant"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""OBS Creator Assistant"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveLegacyTask"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\obs-studio\plugins\obs-creator-assistant"


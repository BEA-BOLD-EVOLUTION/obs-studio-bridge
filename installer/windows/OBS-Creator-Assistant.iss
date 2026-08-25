#ifndef PayloadRoot
  #error PayloadRoot must be supplied to ISCC.
#endif
#ifndef OutputDir
  #error OutputDir must be supplied to ISCC.
#endif
#ifndef AppVersion
  #define AppVersion "1.4.0"
#endif

[Setup]
AppId={{5D4195E2-1DF8-4EF8-93D9-B04C840E9099}
AppName=OBS Creator Assistant
AppVersion={#AppVersion}
AppPublisher=TPC Global LLC
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
VersionInfoCompany=TPC Global LLC
VersionInfoDescription=OBS Creator Assistant installer
VersionInfoProductName=OBS Creator Assistant
VersionInfoProductVersion={#AppVersion}

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#PayloadRoot}\helper\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadRoot}\plugin\obs-creator-assistant.dll"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\bin\64bit"; Flags: ignoreversion
Source: "{#PayloadRoot}\plugin\en-US.ini"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\data\locale"; Flags: ignoreversion
Source: "{#PayloadRoot}\plugin\manifest.json"; DestDir: "{commonappdata}\obs-studio\plugins\obs-creator-assistant\data"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\OBS Creator Assistant"; Filename: "{app}\OBS-Creator-Assistant.exe"; WorkingDir: "{app}"; Comment: "Starts the OBS Creator Assistant local companion when you sign in"
Name: "{autodesktop}\OBS Creator Assistant Setup"; Filename: "http://127.0.0.1:8788/"; Tasks: desktopicon

[Run]
Filename: "{app}\OBS-Creator-Assistant.exe"; Flags: nowait; StatusMsg: "Starting OBS Creator Assistant..."
Filename: "http://127.0.0.1:8788/"; Description: "Set up Creator Assistant now"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{app}\OBS-Creator-Assistant.exe"; Parameters: "--stop"; Flags: waituntilterminated; RunOnceId: "StopAssistant"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\obs-studio\plugins\obs-creator-assistant"


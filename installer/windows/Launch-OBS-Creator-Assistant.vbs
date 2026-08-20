Option Explicit
Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run Chr(34) & root & "\OBS Creator Assistant.cmd" & Chr(34), 0, False



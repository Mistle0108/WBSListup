Option Explicit
Dim shell, fs, root, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
If Not fs.FolderExists(fs.BuildPath(root, "node_modules\electron")) Then
  MsgBox "Dependencies are missing. Run npm install first.", 16, "WBS List up"
  WScript.Quit 1
End If
command = "cmd.exe /d /c cd /d """ & root & """ && npm start"
shell.Run command, 0, False

Set fso = CreateObject("Scripting.FileSystemObject")
Set shellApp = CreateObject("Shell.Application")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = fso.BuildPath(scriptDir, "launch-facturador.cmd")

shellApp.ShellExecute "cmd.exe", "/c """ & cmdPath & """", scriptDir, "runas", 0

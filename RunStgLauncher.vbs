' 纯 ASCII：避免编码问题。约定 STGproj 根目录下仅有一个 .bat（一键启动STG.bat）。
Option Explicit
Dim sh, fso, root, f, batPath, n
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = ""
n = 0
For Each f In fso.GetFolder(root).Files
    If LCase(fso.GetExtensionName(f.Name)) = "bat" Then
        batPath = f.Path
        n = n + 1
    End If
Next
If n <> 1 Then
    MsgBox "STGproj root must contain exactly one .bat launcher (found " & n & ").", vbCritical, "STG"
    WScript.Quit 1
End If
sh.Run "cmd.exe /c """ & batPath & """", 1, False

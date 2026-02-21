$source = @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowText(IntPtr hWnd, string lpString);
}
"@
Add-Type -TypeDefinition $source -Language CSharp

$candidates = Get-Process | Where-Object { $_.MainWindowTitle -like "*Minecraft*" }

if ($candidates) {
    Write-Host "Encontrei $($candidates.Count) processo(s) com 'Minecraft' no título:"
    foreach ($p in $candidates) {
        Write-Host " - PID: $($p.Id), Título: $($p.MainWindowTitle), Processo: $($p.ProcessName)"
        if ($p.MainWindowTitle -like "*1.21.1*" -or $p.MainWindowTitle -like "*NeoForge*") {
            Write-Host "   -> TENTANDO RENOMEAR ESTE..."
            [Win32]::SetWindowText($p.MainWindowHandle, "Pikamon Client")
        }
    }
}
else {
    Write-Host "Nenhuma janela com 'Minecraft' no título encontrada."
    Write-Host "Listando todas as janelas visíveis para debug:"
    Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize
}

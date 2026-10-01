Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Destination Folder"
$dialog.ShowNewFolderButton = $true

# Bring dialog to top
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$topForm.MinimizeBox = $false
$topForm.MaximizeBox = $false
$topForm.ShowInTaskbar = $false
$topForm.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$topForm.WindowState = [System.Windows.Forms.FormWindowState]::Minimized

$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
$topForm.Dispose()
$dialog.Dispose()

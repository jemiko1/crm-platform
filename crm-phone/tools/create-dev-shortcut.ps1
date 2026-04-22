# Creates a pinnable "CRM28 Phone.lnk" on the Desktop that:
#  - Targets node_modules\electron\dist\electron.exe
#  - Passes dist\main\index.js as the argument (dev entrypoint)
#  - Uses resources\icon.ico as the icon
#  - Has AppUserModelID = ge.asg.crm28-phone (so Windows groups it with
#    the running window and uses the right icon)
#
# After running, unpin any old CRM28 Phone from the taskbar, then
# right-click the new desktop shortcut -> Pin to taskbar.

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$electronExe = Join-Path $repoRoot "node_modules\electron\dist\electron.exe"
$mainJs = Join-Path $repoRoot "dist\main\index.js"
$iconPath = Join-Path $repoRoot "resources\icon.ico"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "CRM28 Phone.lnk"

if (-not (Test-Path $electronExe)) { throw "electron.exe not found at $electronExe" }
if (-not (Test-Path $iconPath)) { throw "icon.ico not found at $iconPath" }

# --- Step 1: create the basic shortcut via WScript.Shell ---
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = "`"$mainJs`""
$shortcut.WorkingDirectory = $repoRoot.Path
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "CRM28 Phone (dev)"
$shortcut.Save()

Write-Host "Created shortcut: $lnkPath"

# --- Step 2: stamp AppUserModelID onto the .lnk via IPropertyStore ---
# This is what Windows actually reads to match the pinned shortcut to
# the running window (which sets the same AUMID via app.setAppUserModelId).
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace AumidShortcut {
  [StructLayout(LayoutKind.Sequential, Pack=4)]
  public struct PROPERTYKEY {
    public Guid fmtid;
    public uint pid;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr p;
  }

  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PROPERTYKEY pkey);
    void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    void Commit();
  }

  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName,
             [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
  }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  public class CShellLink {}

  public static class Native {
    [DllImport("ole32.dll")]
    public static extern int PropVariantClear(ref PROPVARIANT pvar);

    public static void SetAumid(string lnkPath, string aumid) {
      object cs = new CShellLink();
      try {
        ((IPersistFile)cs).Load(lnkPath, 2); // STGM_READWRITE
        var pk = new PROPERTYKEY {
          fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
          pid = 5
        };
        // Build PROPVARIANT manually: VT_LPWSTR = 31, pointer to
        // CoTaskMem-allocated wide string. PropVariantClear will free it.
        var pv = new PROPVARIANT();
        pv.vt = 31; // VT_LPWSTR
        pv.p = Marshal.StringToCoTaskMemUni(aumid);
        try {
          ((IPropertyStore)cs).SetValue(ref pk, ref pv);
          ((IPropertyStore)cs).Commit();
          ((IPersistFile)cs).Save(lnkPath, true);
        } finally {
          PropVariantClear(ref pv);
        }
      } finally {
        Marshal.ReleaseComObject(cs);
      }
    }
  }
}
"@

[AumidShortcut.Native]::SetAumid($lnkPath, "ge.asg.crm28-phone")
Write-Host "Stamped AppUserModelID = ge.asg.crm28-phone onto shortcut"

# --- Step 3: nuke the Windows icon cache so the new icon is visible ---
# Without this, Explorer may keep showing the cached Electron atom
# icon even though the shortcut correctly points at icon.ico.
Write-Host "Clearing icon cache..."
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$cachePaths = @(
  (Join-Path $localAppData "IconCache.db"),
  (Join-Path $localAppData "Microsoft\Windows\Explorer\iconcache_*.db"),
  (Join-Path $localAppData "Microsoft\Windows\Explorer\thumbcache_*.db")
)

# Kill explorer so cache files are unlocked
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

foreach ($p in $cachePaths) {
  Get-ChildItem -Path $p -Force -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      Remove-Item $_.FullName -Force -ErrorAction Stop
      Write-Host "  removed $($_.Name)"
    } catch {
      Write-Host "  skipped $($_.Name) (locked)"
    }
  }
}

# Restart explorer
Start-Process explorer.exe
Write-Host ""
Write-Host "DONE."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Right-click any currently-pinned CRM28 Phone / Electron on the taskbar -> Unpin"
Write-Host "  2. Right-click '$lnkPath' -> Pin to taskbar"
Write-Host "  3. Launch with 'pnpm start' as usual -- taskbar icon will stay correct."

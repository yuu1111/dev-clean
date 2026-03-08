using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class ProcCwd {
    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(
        IntPtr hProcess, int pic, ref PROCESS_BASIC_INFORMATION pbi,
        int cb, out int returnLength);

    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

    [DllImport("kernel32.dll")]
    static extern bool ReadProcessMemory(
        IntPtr hProcess, IntPtr baseAddr, byte[] buffer,
        int size, out int bytesRead);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_BASIC_INFORMATION {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    const uint PROCESS_QUERY_INFORMATION = 0x0400;
    const uint PROCESS_VM_READ = 0x0010;

    public static Dictionary<int, string> GetCwds(int[] pids) {
        var result = new Dictionary<int, string>();
        foreach (var pid in pids) {
            try {
                string cwd = GetCwd(pid);
                if (cwd != null) result[pid] = cwd;
            } catch {}
        }
        return result;
    }

    static string GetCwd(int pid) {
        IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProc == IntPtr.Zero) return null;
        try {
            var pbi = new PROCESS_BASIC_INFORMATION();
            int retLen;
            if (NtQueryInformationProcess(hProc, 0, ref pbi, Marshal.SizeOf(pbi), out retLen) != 0)
                return null;

            byte[] buf8 = new byte[8];
            int read;
            IntPtr paramsPtr = IntPtr.Add(pbi.PebBaseAddress, 0x20);
            if (!ReadProcessMemory(hProc, paramsPtr, buf8, 8, out read)) return null;
            IntPtr processParams = (IntPtr)BitConverter.ToInt64(buf8, 0);

            byte[] uniStr = new byte[16];
            IntPtr cdOffset = IntPtr.Add(processParams, 0x38);
            if (!ReadProcessMemory(hProc, cdOffset, uniStr, 16, out read)) return null;
            ushort len = BitConverter.ToUInt16(uniStr, 0);
            IntPtr bufPtr = (IntPtr)BitConverter.ToInt64(uniStr, 8);

            byte[] pathBuf = new byte[len];
            if (!ReadProcessMemory(hProc, bufPtr, pathBuf, len, out read)) return null;
            string path = Encoding.Unicode.GetString(pathBuf, 0, read);
            if (path.Length > 3 && path.EndsWith("\\"))
                path = path.TrimEnd('\\');
            return path;
        } finally {
            CloseHandle(hProc);
        }
    }
}

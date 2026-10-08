import asyncio
from fastapi import FastAPI


async def system(aksi: str, app: FastAPI, root_pass: str):
  app.state.is_lockdown = True
  print(f"[SYSTEM] Server dikunci. Memulai hitung mundur 5 detik untuk {aksi}...")

  try:
    await asyncio.sleep(5)

    if aksi == "reboot":
      cmd = ["sudo", "-S", "reboot"]
    elif aksi in ["shutdown", "poweroff"]:
      cmd = ["sudo", "-S", "shutdown", "-h", "now"]
    else:
      app.state.is_lockdown = False
      return

    # Jalankan proses dan kirim password melalui stdin
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Kirim password yang diakhiri dengan newline (\n)
    _, stderr = await process.communicate(
        input=(root_pass + "\n").encode("utf-8")
    )

    if process.returncode != 0:
      print(f"[SYSTEM] Gagal mengeksekusi: {stderr.decode().strip()}")
      app.state.is_lockdown = False

  except Exception as e:
    print(f"[SYSTEM] Error: {e}")
    app.state.is_lockdown = False
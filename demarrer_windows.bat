@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  set "PYCMD=py -3"
) else (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python est introuvable. Installe Python 3.10+ depuis https://www.python.org/downloads/
    echo Coche "Add python.exe to PATH", puis relance.
    pause
    exit /b 1
  )
  set "PYCMD=python"
)
if not exist ".venv\Scripts\python.exe" (
  echo Creation de l'environnement Python local...
  %PYCMD% -m venv .venv
  if errorlevel 1 (
    echo Impossible de creer l'environnement Python. Verifie l'installation de Python.
    pause
    exit /b 1
  )
)
".venv\Scripts\python.exe" launch.py
if errorlevel 1 (
  echo.
  echo Erreur au demarrage. Copie les messages ci-dessus pour obtenir de l'aide.
)
pause
